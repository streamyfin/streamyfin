-- Seed Jellyfin database with demo user
-- Run this after Jellyfin starts but before completing wizard

-- Insert demo_user with password demo_password (hashed)
-- The password hash is for "demo_password"
INSERT INTO Users (Id, Username, Password, EasyPassword, MustUpdatePassword, AudioLanguagePreference, 
    SubtitleLanguagePreference, AuthenticatedDeviceIds, SubtitleMode, DisplayMissingEpisodes, 
    DisplayUnairedEpisodes, EnableAutoLogin, EnableUserPreferenceAccess, 
    BlockedMediaFolders, BlockedChannels, RemoteClientBitrateLimit, 
    SyncPlayAccess, RowVersion)
VALUES (
    lower(hex(randomblob(16))),  -- UUID
    'demo_user',  -- Username
    'AQAAAAIAAYagAAAAEP0H8KwP+hHjKNL4qHhwbzGVoKAjqBzGq1SWrMm5LHNhdA==',  -- Password hash for "demo_password"
    NULL,  -- EasyPassword
    0,  -- MustUpdatePassword
    '',  -- AudioLanguagePreference
    '',  -- SubtitleLanguagePreference
    '',  -- AuthenticatedDeviceIds
    'Default',  -- SubtitleMode
    0,  -- DisplayMissingEpisodes
    0,  -- DisplayUnairedEpisodes
    0,  -- EnableAutoLogin
    1,  -- EnableUserPreferenceAccess
    '',  -- BlockedMediaFolders
    '',  -- BlockedChannels
    0,  -- RemoteClientBitrateLimit
    'CreateAndJoinGroups',  -- SyncPlayAccess
    0  -- RowVersion
);
