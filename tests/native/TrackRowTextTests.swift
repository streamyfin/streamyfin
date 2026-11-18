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
		print("TrackRowText tests passed")
	}
}
