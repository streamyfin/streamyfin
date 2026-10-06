package expo.modules.mpvplayer.nativeplayer

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class SyncPlayPlaylistItemRecord : Record {
    @Field var itemId: String = ""
    @Field var playlistItemId: String = ""
    @Field var title: String = ""
}

class SyncPlayLibraryItemRecord : Record {
    @Field var itemId: String = ""
    @Field var title: String = ""
}

class SyncPlayStateRecord : Record {
    @Field var groupId: String = ""
    @Field var groupName: String = ""
    @Field var status: String = ""
    @Field var connected: Boolean = false
    @Field var busy: Boolean = false
    @Field var error: String? = null
    @Field var playlist: List<SyncPlayPlaylistItemRecord> = emptyList()
    @Field var currentPlaylistItemId: String? = null
    @Field var repeatMode: String = "RepeatNone"
    @Field var shuffleMode: String = "Sorted"
    @Field var ignoreWait: Boolean = false
    @Field var hasNext: Boolean = false
    @Field var hasPrevious: Boolean = false
    @Field var library: List<SyncPlayLibraryItemRecord> = emptyList()
    @Field var libraryLoading: Boolean = false
    @Field var libraryQuery: String = ""
    @Field var strings: Map<String, String> = emptyMap()
}

class SyncPlayCommandRecord : Record {
    @Field var commandId: String = ""
    @Field var groupId: String = ""
    @Field var playlistItemId: String = ""
    @Field var command: String = ""
    @Field var executeAtMs: Double = 0.0
    @Field var positionSec: Double = 0.0

    internal fun scheduled() = ScheduledSyncPlayCommand(
        commandId, groupId, playlistItemId, command, executeAtMs, positionSec
    )
}
