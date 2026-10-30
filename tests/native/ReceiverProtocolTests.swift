import Foundation

// Replays the shared receiver protocol vectors (e2e/fixtures/receiver-protocol, passed as the first
// argument) against the Swift protocol. Jest, the Python bench and the JUnit reader replay the same
// files; see their README before changing a case.
@main
enum ReceiverProtocolTests {
	static var failures: [String] = []
	static var cases = 0

	static func vectors(_ dir: URL, _ name: String) -> [String: Any] {
		let data = try! Data(contentsOf: dir.appendingPathComponent(name))
		return try! JSONSerialization.jsonObject(with: data) as! [String: Any]
	}

	/// JSON round trip of both sides, so they compare as data rather than as Swift types.
	static func same(_ a: Any?, _ b: Any?) -> Bool {
		func normalized(_ value: Any?) -> Any {
			guard let value, !(value is NSNull) else { return NSNull() }
			guard JSONSerialization.isValidJSONObject([value]) else { return value }
			let data = try! JSONSerialization.data(withJSONObject: [value])
			return (try! JSONSerialization.jsonObject(with: data) as! [Any])[0]
		}
		return (normalized(a) as AnyObject).isEqual(normalized(b))
	}

	static func check(_ file: String, _ name: String, _ ok: Bool) {
		cases += 1
		if !ok { failures.append("\(file): \(name)") }
	}

	static func string(_ raw: [String: Any], _ key: String) -> String? { raw[key] as? String }
	static func int(_ raw: [String: Any], _ key: String) -> Int? { (raw[key] as? NSNumber)?.intValue }
	static func int64(_ raw: [String: Any], _ key: String) -> Int64? { (raw[key] as? NSNumber)?.int64Value }

	static func server(_ raw: [String: Any]) -> ReceiverServer {
		ReceiverServer(
			serverAddress: raw["basePath"] as! String,
			accessToken: raw["accessToken"] as! String,
			userId: raw["userId"] as! String,
			receiverName: string(raw, "receiverName"),
			maxBitrate: int64(raw, "maxBitrate")
		)
	}

	static func request(_ raw: [String: Any]) -> ReceiverPlayRequest {
		let items = (raw["items"] as! [[String: Any]]).map { item in
			ReceiverItem(
				id: string(item, "Id"),
				name: string(item, "Name"),
				type: string(item, "Type"),
				mediaType: string(item, "MediaType"),
				isFolder: (item["IsFolder"] as? Bool) ?? false,
				channelId: string(item, "ChannelId"),
				channelName: string(item, "ChannelName")
			)
		}
		return ReceiverPlayRequest(
			items: items,
			startIndex: int(raw, "startIndex"),
			startPositionTicks: int64(raw, "startPositionTicks"),
			mediaSourceId: string(raw, "mediaSourceId"),
			audioStreamIndex: int(raw, "audioStreamIndex"),
			subtitleStreamIndex: int(raw, "subtitleStreamIndex"),
			liveStreamId: string(raw, "liveStreamId")
		)
	}

	static let refusalServer = ReceiverServer(serverAddress: "https://jellyfin.example.test", accessToken: "tok-123", userId: "user-1")

	/// A container is refused before anything is built, so nothing can be sent.
	static func refused(_ raw: [String: Any]) -> Bool {
		do {
			_ = try ReceiverProtocol.playNow(server: refusalServer, request: request(raw))
			return false
		} catch is ReceiverContainerRefused {
			return true
		} catch {
			return false
		}
	}

	static func customDataDictionary(_ data: ReceiverCustomData) -> [String: Any] {
		func value(_ v: Any?) -> Any { v ?? NSNull() }
		return [
			"itemId": value(data.itemId), "playSessionId": value(data.playSessionId),
			"audioStreamIndex": value(data.audioStreamIndex), "subtitleStreamIndex": value(data.subtitleStreamIndex),
			"mediaSourceId": value(data.mediaSourceId), "playMethod": value(data.playMethod),
			"runtimeTicks": value(data.runtimeTicks), "startPositionTicks": value(data.startPositionTicks),
			"canSeek": value(data.canSeek), "canClientSeek": value(data.canClientSeek),
			"liveStreamId": value(data.liveStreamId),
		]
	}

	static func main() {
		let dir = URL(fileURLWithPath: CommandLine.arguments[1])

		for c in vectors(dir, "play-now.json")["cases"] as! [[String: Any]] {
			let session = server(c["session"] as! [String: Any])
			if (c["expected"] as? [String: Any])?["refused"] as? String == "container" {
				check("play-now.json", c["name"] as! String, refused(c["request"] as! [String: Any]))
				continue
			}
			let sent: [String: Any]
			if let raw = c["request"] as? [String: Any] {
				sent = try! ReceiverProtocol.playNow(server: session, request: request(raw))
			} else {
				sent = ReceiverProtocol.message(command: c["command"] as! String, server: session, options: (c["options"] as? [String: Any]) ?? [:])
			}
			check("play-now.json", c["name"] as! String, same(sent, c["expected"]))
		}

		let names = vectors(dir, "receiver-name.json")
		for c in names["receiverNameFor"] as! [[String: Any]] {
			let input = c["input"] as? [String: Any]
			let device = input.map { ReceiverDevice(friendlyName: $0["friendlyName"] as? String, deviceId: $0["deviceId"] as? String) }
			check("receiver-name.json", c["name"] as! String, same(ReceiverProtocol.receiverNameFor(device), c["expected"]))
		}
		for c in names["toReceiverDeviceName"] as! [[String: Any]] {
			check("receiver-name.json", c["name"] as! String, ReceiverProtocol.toReceiverDeviceName(c["input"] as! String) == c["expected"] as! String)
		}

		for c in vectors(dir, "queue-window.json")["cases"] as! [[String: Any]] {
			let input = c["input"] as! [String: Any]
			let window = ReceiverProtocol.queueWindow(input["queue"] as! [String], selectedIndex: input["selectedIndex"] as! Int, maxItems: input["maxItems"] as! Int)
			let expected = c["expected"] as! [String: Any]
			check("queue-window.json", c["name"] as! String, window.items == expected["items"] as! [String] && window.startIndex == expected["startIndex"] as! Int)
		}

		for c in vectors(dir, "bus-messages.json")["cases"] as! [[String: Any]] {
			// An object is the message as the receiver builds it: the wire and the bridges deliver a string.
			let raw: String
			if let object = c["input"] as? [String: Any] {
				raw = String(data: try! JSONSerialization.data(withJSONObject: object), encoding: .utf8)!
			} else {
				raw = c["input"] as! String
			}
			let expected = c["expected"] as! [String: Any]
			switch ReceiverProtocol.parseMessage(raw) {
			case .parsed(let json): check("bus-messages.json", c["name"] as! String, same(json, expected))
			case .unparsed(let text): check("bus-messages.json", c["name"] as! String, (expected["invalid"] as? Bool) == true && text == raw)
			}
		}

		for c in vectors(dir, "media-status-custom-data.json")["cases"] as! [[String: Any]] {
			let parsed = ReceiverProtocol.parseCustomData(c["input"] as? [String: Any])
			check("media-status-custom-data.json", c["name"] as! String, same(customDataDictionary(parsed), c["expected"]))
		}

		for c in vectors(dir, "media-position.json")["cases"] as! [[String: Any]] {
			let input = c["input"] as! [String: Any]
			let data = ReceiverProtocol.parseCustomData(input["customData"] as? [String: Any])
			let position = ReceiverProtocol.positionInItem(currentTime: (input["currentTime"] as! NSNumber).doubleValue, customData: data)
			check("media-position.json", c["name"] as! String, abs(position - (c["expected"] as! NSNumber).doubleValue) < 1e-9)
		}

		let outcomes = vectors(dir, "load-outcomes.json")
		for c in outcomes["cases"] as! [[String: Any]] {
			let raw = (c["request"] as? [String: Any]) ?? outcomes["request"] as! [String: Any]
			if (c["expected"] as? [String: Any])?["refused"] as? String == "container" {
				check("load-outcomes.json", c["name"] as! String, refused(raw))
				continue
			}
			let sent = request(raw)
			let previous = c["previous"] as? [String: Any]
			let tracker = ReceiverLoadTracker(request: sent, previousPlaySessionId: previous?["playSessionId"] as? String)
			for event in c["events"] as! [[String: Any]] {
				if let status = event["status"] as? [String: Any] {
					_ = tracker.onMediaStatus(customData: ReceiverProtocol.parseCustomData(status), playerState: status["playerState"] as? String)
				} else if let message = event["message"] as? [String: Any] {
					let raw = String(data: try! JSONSerialization.data(withJSONObject: message), encoding: .utf8)!
					_ = tracker.onMessage(ReceiverProtocol.parseMessage(raw))
				} else if event["timeout"] as? Bool == true {
					_ = tracker.timeOut()
				} else if event["supersede"] as? Bool == true {
					_ = tracker.supersede()
				}
			}
			let expected = c["expected"] as! [String: Any]
			var ok = tracker.outcome?.wireName == expected["status"] as? String
			if let error = expected["error"] as? String {
				if case .failed(let failure, _) = tracker.outcome { ok = ok && failure.rawValue == error } else { ok = false }
			}
			check("load-outcomes.json", c["name"] as! String, ok)
		}

		// Not a shared vector: TypeScript and Python keep any number, while Swift's integer initializers
		// trap outside their range. A receiver's out-of-range value saturates, as Kotlin's toInt() and
		// toLong() do, instead of crashing the app.
		let huge = ReceiverProtocol.parseCustomData([
			"runtimeTicks": 1e30, "startPositionTicks": -1e30, "audioStreamIndex": "1e30", "subtitleStreamIndex": -1e300,
		])
		check("swift", "out-of-range customData numbers saturate", huge.runtimeTicks == Int64.max
			&& huge.startPositionTicks == Int64.min && huge.audioStreamIndex == Int.max && huge.subtitleStreamIndex == Int.min)
		let seek = ReceiverProtocol.message(
			command: "Seek",
			server: ReceiverServer(serverAddress: "http://server", accessToken: "token", userId: "user"),
			options: ["position": 1e30]
		)
		check("swift", "an out-of-range seek position saturates", (seek["options"] as? [String: Any])?["position"] as? Int64 == Int64.max)

		// JSON has no NaN or infinity: JSON.stringify writes null, where JSONSerialization would raise an
		// Objective-C exception Swift cannot catch. Anything but a number is sent as it is, as TypeScript
		// and Kotlin do.
		let nanSeek = ReceiverProtocol.message(command: "Seek", server: refusalServer, options: ["position": Double.nan])
		check("swift", "a Seek position JSON cannot hold goes as null", JSONSerialization.isValidJSONObject(nanSeek)
			&& (nanSeek["options"] as? [String: Any])?["position"] is NSNull)
		let textSeek = ReceiverProtocol.message(command: "Seek", server: refusalServer, options: ["position": "125.6"])
		check("swift", "a Seek position that is not a number is sent as it is", (textSeek["options"] as? [String: Any])?["position"] as? String == "125.6")

		if failures.isEmpty {
			print("PASS: receiver protocol vectors (\(cases) cases)")
		} else {
			failures.forEach { print("FAIL: \($0)") }
			exit(1)
		}
	}
}
