import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useCallback, useState } from "react";
import { CreatePlaylistModal } from "@/components/music/CreatePlaylistModal";
import { PlaylistPickerSheet } from "@/components/music/PlaylistPickerSheet";
import { TrackOptionsSheet } from "@/components/music/TrackOptionsSheet";

interface Props {
  track: BaseItemDto | null;
  open: boolean;
  setOpen: (open: boolean) => void;
}

/**
 * A song's options sheet with the playlist picker and the new playlist dialog
 * it leads to, for a song list that is not itself a playlist.
 */
export const TrackOptionsSheets: React.FC<Props> = ({
  track,
  open,
  setOpen,
}) => {
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);

  const openPlaylistPicker = useCallback(() => setPlaylistPickerOpen(true), []);
  const openCreatePlaylist = useCallback(() => setCreatePlaylistOpen(true), []);

  return (
    <>
      <TrackOptionsSheet
        open={open}
        setOpen={setOpen}
        track={track}
        onAddToPlaylist={openPlaylistPicker}
      />
      <PlaylistPickerSheet
        open={playlistPickerOpen}
        setOpen={setPlaylistPickerOpen}
        trackToAdd={track}
        onCreateNew={openCreatePlaylist}
      />
      <CreatePlaylistModal
        open={createPlaylistOpen}
        setOpen={setCreatePlaylistOpen}
        initialTrackId={track?.Id}
      />
    </>
  );
};
