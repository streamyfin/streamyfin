import Foundation

// The local player's Remote asks JS for the remote player once the local player is gone; a request made while
// no module listens (a JS reload) waits for the next mount, and the event and the mount take it once.
@main
enum RemotePlayerRequestsTests {
    static func main() {
        let requests = RemotePlayerRequests()
        var heard = 0
        let stop = requests.listen { heard += 1 }

        requests.request()
        precondition(heard == 1)
        precondition(requests.consume())
        precondition(!requests.consume())

        stop()
        requests.request()
        precondition(heard == 1)
        precondition(requests.consume())

        print("PASS: a remote player request is heard, kept while no one listens, and taken once")
    }
}
