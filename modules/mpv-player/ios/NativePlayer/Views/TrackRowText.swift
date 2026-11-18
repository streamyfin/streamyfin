import Foundation

/// What a track row says: its label, and the format and flags JS put under it.
enum TrackRowText {
	/// The second line, or none when JS has nothing to add to the label.
	static func detailLine(_ detail: String?) -> String? {
		guard let detail, !detail.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
		return detail
	}

	/// A row of the phone's track menus. Choosing a row adds its check and leaves its text as it is.
	struct MenuRow {
		let title: String
		let subtitle: String?
		let checked: Bool
	}

	static func menuRow(_ label: String, _ detail: String?, selected: Bool) -> MenuRow {
		MenuRow(title: label, subtitle: detailLine(detail), checked: selected)
	}

	/// One line, for menus that draw a single line per row (the TV's).
	static func oneLine(_ label: String, _ detail: String?) -> String {
		detailLine(detail).map { "\(label) · \($0)" } ?? label
	}
}
