import Foundation
import CoreVideo
import Metal
import CoreMedia
import AVFoundation

/// Manages a pool of IOSurface-backed CVPixelBuffers that can be shared between Metal and AVFoundation
/// This enables zero-copy rendering where mpv renders to Metal textures that are directly usable by AVSampleBufferDisplayLayer
final class IOSurfaceBufferPool {
    
    struct PooledBuffer {
        let pixelBuffer: CVPixelBuffer
        let texture: MTLTexture
        let ioSurface: IOSurfaceRef
    }
    
    private let device: MTLDevice
    private var pool: CVPixelBufferPool?
    private var buffers: [PooledBuffer] = []
    private var availableBuffers: [PooledBuffer] = []
    private let lock = NSLock()
    
    private(set) var width: Int = 0
    private(set) var height: Int = 0
    private(set) var pixelFormat: OSType = kCVPixelFormatType_32BGRA
    
    private let maxBufferCount: Int
    
    init(device: MTLDevice, maxBufferCount: Int = 3) {
        self.device = device
        self.maxBufferCount = maxBufferCount
    }
    
    deinit {
        invalidate()
    }
    
    /// Configure the pool for a specific video size and format
    func configure(width: Int, height: Int, pixelFormat: OSType = kCVPixelFormatType_32BGRA) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        
        guard width > 0, height > 0 else { return false }
        
        // Skip if already configured for this size
        if self.width == width && self.height == height && self.pixelFormat == pixelFormat && pool != nil {
            return true
        }
        
        // Clear existing buffers
        buffers.removeAll()
        availableBuffers.removeAll()
        pool = nil
        
        self.width = width
        self.height = height
        self.pixelFormat = pixelFormat
        
        // Create pixel buffer pool with IOSurface and Metal compatibility
        let pixelBufferAttributes: [CFString: Any] = [
            kCVPixelBufferPixelFormatTypeKey: pixelFormat,
            kCVPixelBufferWidthKey: width,
            kCVPixelBufferHeightKey: height,
            kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary,
            kCVPixelBufferMetalCompatibilityKey: true,
            kCVPixelBufferCGImageCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true
        ]
        
        let poolAttributes: [CFString: Any] = [
            kCVPixelBufferPoolMinimumBufferCountKey: maxBufferCount
        ]
        
        var newPool: CVPixelBufferPool?
        let status = CVPixelBufferPoolCreate(
            kCFAllocatorDefault,
            poolAttributes as CFDictionary,
            pixelBufferAttributes as CFDictionary,
            &newPool
        )
        
        guard status == kCVReturnSuccess, let createdPool = newPool else {
            Logger.shared.log("Failed to create IOSurface buffer pool: \(status)", type: "Error")
            return false
        }
        
        pool = createdPool
        
        // Pre-allocate buffers
        for _ in 0..<maxBufferCount {
            if let buffer = createPooledBuffer() {
                buffers.append(buffer)
                availableBuffers.append(buffer)
            }
        }
        
        Logger.shared.log("IOSurfaceBufferPool configured: \(width)x\(height), \(buffers.count) buffers", type: "Info")
        return true
    }
    
    /// Get an available buffer for rendering
    func dequeueBuffer() -> PooledBuffer? {
        lock.lock()
        defer { lock.unlock() }
        
        if let buffer = availableBuffers.popLast() {
            return buffer
        }
        
        // Try to create a new buffer if under limit
        if buffers.count < maxBufferCount, let buffer = createPooledBuffer() {
            buffers.append(buffer)
            return buffer
        }
        
        // All buffers in use - create temporary one
        return createPooledBuffer()
    }
    
    /// Return a buffer to the pool after use
    func enqueueBuffer(_ buffer: PooledBuffer) {
        lock.lock()
        defer { lock.unlock() }
        
        // Only return to available pool if it's one of our managed buffers
        if buffers.contains(where: { $0.pixelBuffer == buffer.pixelBuffer }) {
            availableBuffers.append(buffer)
        }
    }
    
    /// Clear all buffers and reset the pool
    func invalidate() {
        lock.lock()
        defer { lock.unlock() }
        
        buffers.removeAll()
        availableBuffers.removeAll()
        pool = nil
        width = 0
        height = 0
    }
    
    private func createPooledBuffer() -> PooledBuffer? {
        guard let pool = pool else { return nil }
        
        var pixelBuffer: CVPixelBuffer?
        let status = CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pixelBuffer)
        
        guard status == kCVReturnSuccess, let buffer = pixelBuffer else {
            Logger.shared.log("Failed to create pixel buffer from pool: \(status)", type: "Error")
            return nil
        }
        
        // Get IOSurface from pixel buffer
        guard let ioSurface = CVPixelBufferGetIOSurface(buffer)?.takeUnretainedValue() else {
            Logger.shared.log("Failed to get IOSurface from pixel buffer", type: "Error")
            return nil
        }
        
        // Create Metal texture from IOSurface
        let textureDescriptor = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: metalPixelFormat(for: pixelFormat),
            width: width,
            height: height,
            mipmapped: false
        )
        textureDescriptor.usage = [.renderTarget, .shaderRead, .shaderWrite]
        textureDescriptor.storageMode = .shared
        
        guard let texture = device.makeTexture(descriptor: textureDescriptor, iosurface: ioSurface, plane: 0) else {
            Logger.shared.log("Failed to create Metal texture from IOSurface", type: "Error")
            return nil
        }
        
        return PooledBuffer(pixelBuffer: buffer, texture: texture, ioSurface: ioSurface)
    }
    
    private func metalPixelFormat(for cvFormat: OSType) -> MTLPixelFormat {
        switch cvFormat {
        case kCVPixelFormatType_32BGRA:
            return .bgra8Unorm
        case kCVPixelFormatType_32RGBA:
            return .rgba8Unorm
        case kCVPixelFormatType_64RGBAHalf:
            return .rgba16Float
        default:
            return .bgra8Unorm
        }
    }
}

// MARK: - CMSampleBuffer Creation

extension IOSurfaceBufferPool {
    
    /// Create a CMSampleBuffer from a pooled buffer for AVSampleBufferDisplayLayer
    static func createSampleBuffer(
        from pixelBuffer: CVPixelBuffer,
        formatDescription: CMVideoFormatDescription,
        presentationTime: CMTime
    ) -> CMSampleBuffer? {
        var timing = CMSampleTimingInfo(
            duration: .invalid,
            presentationTimeStamp: presentationTime,
            decodeTimeStamp: .invalid
        )
        
        var sampleBuffer: CMSampleBuffer?
        let status = CMSampleBufferCreateForImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            dataReady: true,
            makeDataReadyCallback: nil,
            refcon: nil,
            formatDescription: formatDescription,
            sampleTiming: &timing,
            sampleBufferOut: &sampleBuffer
        )
        
        guard status == noErr else {
            Logger.shared.log("Failed to create sample buffer: \(status)", type: "Error")
            return nil
        }
        
        return sampleBuffer
    }
    
    /// Create a format description for the current pool configuration
    func createFormatDescription() -> CMVideoFormatDescription? {
        guard let buffer = dequeueBuffer() else { return nil }
        defer { enqueueBuffer(buffer) }
        
        var formatDescription: CMVideoFormatDescription?
        let status = CMVideoFormatDescriptionCreateForImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: buffer.pixelBuffer,
            formatDescriptionOut: &formatDescription
        )
        
        guard status == noErr else {
            Logger.shared.log("Failed to create format description: \(status)", type: "Error")
            return nil
        }
        
        return formatDescription
    }
}
