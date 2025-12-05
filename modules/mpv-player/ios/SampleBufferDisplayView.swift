//
//  SampleBufferDisplayView.swift
//  test
//
//  Created by Francesco on 28/09/25.
//

import UIKit
import AVFoundation

final class SampleBufferDisplayView: UIView {
    override class var layerClass: AnyClass { AVSampleBufferDisplayLayer.self }
    
    var displayLayer: AVSampleBufferDisplayLayer {
        return layer as! AVSampleBufferDisplayLayer
    }
    
    private(set) var pipController: PiPController?
    
    weak var pipDelegate: PiPControllerDelegate? {
        didSet {
            pipController?.delegate = pipDelegate
        }
    }
    
    override init(frame: CGRect) {
        super.init(frame: frame)
        commonInit()
    }
    
    required init?(coder: NSCoder) {
        super.init(coder: coder)
        commonInit()
    }
    
    private func commonInit() {
        backgroundColor = .black
        displayLayer.videoGravity = .resizeAspect
        if #available(iOS 17.0, *) {
            displayLayer.wantsExtendedDynamicRangeContent = true
        }
        setupPictureInPicture()
    }
    
    private func setupPictureInPicture() {
        pipController = PiPController(sampleBufferDisplayLayer: displayLayer)
    }
    
    // MARK: - PiP Control Methods
    
    func startPictureInPicture() {
        pipController?.startPictureInPicture()
    }
    
    func stopPictureInPicture() {
        pipController?.stopPictureInPicture()
    }
    
    var isPictureInPictureSupported: Bool {
        return pipController?.isPictureInPictureSupported ?? false
    }
    
    var isPictureInPictureActive: Bool {
        return pipController?.isPictureInPictureActive ?? false
    }
    
    var isPictureInPicturePossible: Bool {
        return pipController?.isPictureInPicturePossible ?? false
    }
}
