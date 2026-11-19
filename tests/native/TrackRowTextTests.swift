import Foundation

/// JS finishes a track row in two parts, the language and what is under it. These cases pin what the
/// menus draw of the second part: a line of its own on the phone, one line with the label on the TV.
@main
enum TrackRowTextTests {
	static func expect(_ condition: Bool, _ message: @autoclosure () -> String) {
		precondition(condition, message())
	}

	static func main() {
		// aTrackRowCarriesItsDetail
		expect(TrackRowText.detailLine("AC3 · 5.1") == "AC3 · 5.1", "a detail is drawn as is")
		expect(TrackRowText.detailLine(nil) == nil, "no detail, no second line")
		expect(TrackRowText.detailLine(" ") == nil, "a blank detail draws no empty line")
		expect(
			TrackRowText.oneLine("English", "AC3 · 5.1") == "English · AC3 · 5.1",
			"the TV's one-line row joins the label and the detail"
		)
		expect(TrackRowText.oneLine("English", nil) == "English", "a row without detail keeps its label")

		// aChosenTrackKeepsItsSecondLine: the phone's menu drew the chosen track's label alone, so two
		// "Undetermined" rows stood apart only by the format of the one not playing (bench of 18/11).
		let chosen = TrackRowText.menuRow("Undetermined", "AC3 · 5.1", selected: true)
		let other = TrackRowText.menuRow("Undetermined", "AC3 · 5.1", selected: false)
		expect(chosen.subtitle == "AC3 · 5.1", "the chosen row keeps its second line")
		expect(chosen.checked && !other.checked, "only the chosen row has the check")
		expect(
			chosen.title == other.title && chosen.subtitle == other.subtitle,
			"choosing a row changes its check, not its text"
		)
		expect(
			TrackRowText.menuRow("Off", " ", selected: true).subtitle == nil,
			"a chosen row without detail draws no empty line"
		)
		print("TrackRowText tests passed")
	}
}
