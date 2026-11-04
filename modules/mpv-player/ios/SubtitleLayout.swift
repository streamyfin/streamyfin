import CoreGraphics
import Foundation

/// Ordinary subtitle layout expressed independently of the renderer/platform.
/// All sizes describe rectangles on the screen, in the same units:
/// - canvas: the full rendered subtitle canvas, including offscreen pixels
/// - viewport: the clipping player bounds
/// - reference: the subtitle canvas before video zoom
struct SubtitleLayout {
    var scale: Double = 1
    var position: Double = 100
    var marginX: Double = 25
    var marginY: Double = 22
    var alignmentY: String = "bottom"

    func fitting(canvas: CGSize, viewport: CGSize, reference: CGSize) -> SubtitleLayout {
        guard [canvas.width, canvas.height, viewport.width, viewport.height,
               reference.width, reference.height].allSatisfy({ $0.isFinite && $0 > 0 }) else { return self }

        let visibleWidth = Double(min(1, viewport.width / canvas.width))
        let visibleHeight = Double(min(1, viewport.height / canvas.height))
        let mappedPosition = 50 + (position - 50) * visibleHeight
        let mappedScale = scale * Double(reference.height / canvas.height)
        let mappedMarginY: Double
        if alignmentY == "top", mappedScale > 0 {
            // Top-aligned text ignores libass line_position; inset the cropped
            // top edge directly, keeping the visible user margin unchanged.
            let croppedTop = Double(max(0, canvas.height - viewport.height) / 2)
            mappedMarginY = marginY + croppedTop * 720 / (Double(canvas.height) * mappedScale)
        } else {
            mappedMarginY = mappedPosition > 0 ? marginY * position / mappedPosition : marginY
        }
        return SubtitleLayout(
            scale: mappedScale,
            position: mappedPosition,
            // MPV's converted-text margins use a 960x720 reference. Reserve
            // the cropped sides as well as the requested visible text margin.
            marginX: (1 - visibleWidth) * 480 + marginX * Double(reference.width / canvas.width),
            // libass applies line_position after subtracting its bottom margin.
            marginY: mappedMarginY,
            alignmentY: alignmentY
        )
    }
}

/// Native ASS margins are script coordinates, not MPV's 960x720 text margins.
/// Read original codec metadata so repeated zooms never transform an override.
struct ASSSubtitleLayout {
    struct Style {
        var name: String
        var left: Double
        var right: Double
        var vertical: Double
        var alignment: Int
    }

    var resolution: CGSize
    var styles: [Style]

    init?(extradata: String) {
        var section = ""
        var fields: [String] = []
        var width = 0.0, height = 0.0
        var parsed: [Style] = []
        for raw in extradata.components(separatedBy: .newlines) {
            let line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if line.hasPrefix("[") { section = line.lowercased(); continue }
            guard let colon = line.firstIndex(of: ":") else { continue }
            let key = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
            let value = String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
            if section == "[script info]" {
                if key == "playresx" { width = Double(value) ?? 0 }
                if key == "playresy" { height = Double(value) ?? 0 }
            } else if section == "[v4+ styles]" || section == "[v4 styles]" {
                if key == "format" {
                    fields = value.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
                } else if key == "style" {
                    let values = value.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }
                    guard values.count == fields.count else { continue }
                    func field(_ name: String) -> String? {
                        fields.firstIndex(of: name).map { values[$0] }
                    }
                    guard let name = field("name"), !name.isEmpty,
                          let left = field("marginl").flatMap(Double.init),
                          let right = field("marginr").flatMap(Double.init),
                          let vertical = field("marginv").flatMap(Double.init),
                          let alignment = field("alignment").flatMap(Int.init),
                          [left, right, vertical].allSatisfy({ $0.isFinite && $0 >= 0 && $0 <= Double(Int32.max) }) else { continue }
                    // SSA uses a different top/center alignment numbering.
                    let normalized = section == "[v4 styles]"
                        ? ([5, 6, 7].contains(alignment) ? 8 : ([9, 10, 11].contains(alignment) ? 5 : 2))
                        : alignment
                    parsed.append(Style(name: name, left: left, right: right, vertical: vertical, alignment: normalized))
                }
            }
        }
        guard [width, height].allSatisfy({ $0.isFinite && $0 > 0 && $0 <= Double(Int32.max) }),
              !parsed.isEmpty else { return nil }
        resolution = CGSize(width: width, height: height)
        styles = parsed
    }

    func overrides(canvas: CGSize, viewport: CGSize, reference: CGSize, position: Double) -> [String] {
        guard [canvas.width, canvas.height, viewport.width, viewport.height,
               reference.width, reference.height].allSatisfy({ $0.isFinite && $0 > 0 }),
              canvas.width > viewport.width || canvas.height > viewport.height else { return [] }
        let cropX = Double(max(0, canvas.width - viewport.width) / (2 * canvas.width))
        let cropY = Double(max(0, canvas.height - viewport.height) / (2 * canvas.height))
        let ratioX = Double(reference.width / canvas.width)
        let ratioY = Double(reference.height / canvas.height)
        let mappedPosition = 50 + (position - 50) * Double(min(1, viewport.height / canvas.height))
        return styles.flatMap { style -> [String] in
            let left = cropX * resolution.width + style.left * ratioX
            let right = cropX * resolution.width + style.right * ratioX
            let vertical: Double
            if style.alignment >= 7 {
                vertical = cropY * resolution.height + style.vertical * ratioY
            } else if style.alignment <= 3 && mappedPosition > 0 {
                vertical = style.vertical * ratioY * position / mappedPosition
            } else {
                vertical = style.vertical * ratioY
            }
            return ["\(style.name).MarginL=\(Int(left.rounded()))",
                    "\(style.name).MarginR=\(Int(right.rounded()))",
                    "\(style.name).MarginV=\(Int(vertical.rounded()))"]
        }
    }
}
