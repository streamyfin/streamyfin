// Generated from seerr-team/seerr@v3.4.1, sha256 9c2acc0d508a1a9d6cef0c78db0923879ce50ca78a528e3d8f9e5eb26bb8a4f5.
// Run `bun run seerr:types` rather than editing this file.
export interface paths {
    "/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Seerr status
         * @description Returns the current Seerr status in a JSON object. updateAvailable and commitsBehind are omitted when checkUpdateAvailable is false.
         */
        get: {
            parameters: {
                query?: {
                    /**
                     * @description If false, updateAvailable and commitsBehind will be omitted from the response. Defaults to the versionCheck setting.
                     * @example false
                     */
                    checkUpdateAvailable?: boolean;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned status */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1.0.0 */
                            version?: string;
                            commitTag?: string;
                            updateAvailable?: boolean;
                            commitsBehind?: number;
                            restartRequired?: boolean;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/status/appdata": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get application data volume status
         * @description For Docker installs, returns whether or not the volume mount was configured properly. Always returns true for non-Docker installs.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Application data volume status and path */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example true */
                            appData?: boolean;
                            /** @example /app/config */
                            appDataPath?: string;
                            /** @example true */
                            appDataPermissions?: boolean;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/main": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get main settings
         * @description Retrieves all main settings in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MainSettings"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Update main settings
         * @description Updates main settings with the provided values.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["MainSettings"];
                };
            };
            responses: {
                /** @description Values were sucessfully updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MainSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/network": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get network settings
         * @description Retrieves all network settings in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MainSettings"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Update network settings
         * @description Updates network settings with the provided values.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["NetworkSettings"];
                };
            };
            responses: {
                /** @description Values were sucessfully updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NetworkSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/main/regenerate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Get main settings with newly-generated API key
         * @description Returns main settings in a JSON object, using the new API key.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MainSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/jellyfin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Jellyfin settings
         * @description Retrieves current Jellyfin settings.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["JellyfinSettings"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Update Jellyfin settings
         * @description Updates Jellyfin settings with the provided values.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["JellyfinSettings"];
                };
            };
            responses: {
                /** @description Values were successfully updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["JellyfinSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/jellyfin/library": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Jellyfin libraries
         * @description Returns a list of Jellyfin libraries in a JSON array.
         */
        get: {
            parameters: {
                query?: {
                    /** @description Syncs the current libraries with the current Jellyfin server */
                    sync?: string | null;
                    /** @description Comma separated list of libraries to enable. Any libraries not passed will be disabled! */
                    enable?: string | null;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Jellyfin libraries returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["JellyfinLibrary"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/jellyfin/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Jellyfin Users
         * @description Returns a list of Jellyfin Users in a JSON array.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Jellyfin users returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            username?: string;
                            id?: string;
                            thumb?: string;
                            email?: string;
                        }[];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/jellyfin/sync": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get status of full Jellyfin library sync
         * @description Returns sync progress in a JSON array.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Status of Jellyfin sync */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example false */
                            running?: boolean;
                            /** @example 0 */
                            progress?: number;
                            /** @example 100 */
                            total?: number;
                            currentLibrary?: components["schemas"]["JellyfinLibrary"];
                            libraries?: components["schemas"]["JellyfinLibrary"][];
                        };
                    };
                };
            };
        };
        put?: never;
        /**
         * Start full Jellyfin library sync
         * @description Runs a full Jellyfin library sync and returns the progress in a JSON array.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example false */
                        cancel?: boolean;
                        /** @example false */
                        start?: boolean;
                    };
                };
            };
            responses: {
                /** @description Status of Jellyfin sync */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example false */
                            running?: boolean;
                            /** @example 0 */
                            progress?: number;
                            /** @example 100 */
                            total?: number;
                            currentLibrary?: components["schemas"]["JellyfinLibrary"];
                            libraries?: components["schemas"]["JellyfinLibrary"][];
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/plex": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Plex settings
         * @description Retrieves current Plex settings.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PlexSettings"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Update Plex settings
         * @description Updates Plex settings with the provided values.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["PlexSettings"];
                };
            };
            responses: {
                /** @description Values were successfully updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PlexSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/plex/library": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Plex libraries
         * @description Returns a list of Plex libraries in a JSON array.
         */
        get: {
            parameters: {
                query?: {
                    /** @description Syncs the current libraries with the current Plex server */
                    sync?: string | null;
                    /** @description Comma separated list of libraries to enable. Any libraries not passed will be disabled! */
                    enable?: string | null;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Plex libraries returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PlexLibrary"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/plex/sync": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get status of full Plex library scan
         * @description Returns scan progress in a JSON array.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Status of Plex scan */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example false */
                            running?: boolean;
                            /** @example 0 */
                            progress?: number;
                            /** @example 100 */
                            total?: number;
                            currentLibrary?: components["schemas"]["PlexLibrary"];
                            libraries?: components["schemas"]["PlexLibrary"][];
                        };
                    };
                };
            };
        };
        put?: never;
        /**
         * Start full Plex library scan
         * @description Runs a full Plex library scan and returns the progress in a JSON array.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @example false */
                        cancel?: boolean;
                        /** @example false */
                        start?: boolean;
                    };
                };
            };
            responses: {
                /** @description Status of Plex scan */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example false */
                            running?: boolean;
                            /** @example 0 */
                            progress?: number;
                            /** @example 100 */
                            total?: number;
                            currentLibrary?: components["schemas"]["PlexLibrary"];
                            libraries?: components["schemas"]["PlexLibrary"][];
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/plex/devices/servers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Gets the user's available Plex servers
         * @description Returns a list of available Plex servers and their connectivity state
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PlexDevice"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/plex/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Plex users
         * @description Returns a list of Plex users in a JSON array.
         *
         *     Requires the `MANAGE_USERS` permission.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Plex users */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id?: string;
                            title?: string;
                            username?: string;
                            email?: string;
                            thumb?: string;
                        }[];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/metadatas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Metadata settings
         * @description Retrieves current Metadata settings.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MetadataSettings"];
                    };
                };
            };
        };
        /**
         * Update Metadata settings
         * @description Updates Metadata settings with the provided values.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["MetadataSettings"];
                };
            };
            responses: {
                /** @description Values were successfully updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MetadataSettings"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/metadatas/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Test Provider configuration
         * @description Tests if the TVDB configuration is valid. Returns a list of available languages on success.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @example true */
                        tmdb?: boolean;
                        /** @example true */
                        tvdb?: boolean;
                    };
                };
            };
            responses: {
                /** @description Succesfully connected to TVDB */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example Successfully connected to TVDB */
                            message?: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/tautulli": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Tautulli settings
         * @description Retrieves current Tautulli settings.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TautulliSettings"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Update Tautulli settings
         * @description Updates Tautulli settings with the provided values.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["TautulliSettings"];
                };
            };
            responses: {
                /** @description Values were successfully updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TautulliSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/radarr": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Radarr settings
         * @description Returns all Radarr settings in a JSON array.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Values were returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RadarrSettings"][];
                    };
                };
            };
        };
        put?: never;
        /**
         * Create Radarr instance
         * @description Creates a new Radarr instance from the request body.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["RadarrSettings"];
                };
            };
            responses: {
                /** @description New Radarr instance created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RadarrSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/radarr/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Test Radarr configuration
         * @description Tests if the Radarr configuration is valid. Returns profiles and root folders on success.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @example 127.0.0.1 */
                        hostname: string;
                        /** @example 7878 */
                        port: number;
                        /** @example yourapikey */
                        apiKey: string;
                        /** @example false */
                        useSsl: boolean;
                        baseUrl?: string;
                    };
                };
            };
            responses: {
                /** @description Succesfully connected to Radarr instance */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            profiles?: components["schemas"]["ServiceProfile"][];
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/radarr/{radarrId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Update Radarr instance
         * @description Updates an existing Radarr instance with the provided values.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Radarr instance ID */
                    radarrId: number;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["RadarrSettings"];
                };
            };
            responses: {
                /** @description Radarr instance updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RadarrSettings"];
                    };
                };
            };
        };
        post?: never;
        /**
         * Delete Radarr instance
         * @description Deletes an existing Radarr instance based on the radarrId parameter.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Radarr instance ID */
                    radarrId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Radarr instance updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RadarrSettings"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/radarr/{radarrId}/profiles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get available Radarr profiles
         * @description Returns a list of profiles available on the Radarr server instance in a JSON array.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Radarr instance ID */
                    radarrId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned list of profiles */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ServiceProfile"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/sonarr": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Sonarr settings
         * @description Returns all Sonarr settings in a JSON array.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Values were returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SonarrSettings"][];
                    };
                };
            };
        };
        put?: never;
        /**
         * Create Sonarr instance
         * @description Creates a new Sonarr instance from the request body.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SonarrSettings"];
                };
            };
            responses: {
                /** @description New Sonarr instance created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SonarrSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/sonarr/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Test Sonarr configuration
         * @description Tests if the Sonarr configuration is valid. Returns profiles and root folders on success.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @example 127.0.0.1 */
                        hostname: string;
                        /** @example 8989 */
                        port: number;
                        /** @example yourapikey */
                        apiKey: string;
                        /** @example false */
                        useSsl: boolean;
                        baseUrl?: string;
                    };
                };
            };
            responses: {
                /** @description Succesfully connected to Sonarr instance */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            profiles?: components["schemas"]["ServiceProfile"][];
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/sonarr/{sonarrId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Update Sonarr instance
         * @description Updates an existing Sonarr instance with the provided values.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Sonarr instance ID */
                    sonarrId: number;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SonarrSettings"];
                };
            };
            responses: {
                /** @description Sonarr instance updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SonarrSettings"];
                    };
                };
            };
        };
        post?: never;
        /**
         * Delete Sonarr instance
         * @description Deletes an existing Sonarr instance based on the sonarrId parameter.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Sonarr instance ID */
                    sonarrId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Sonarr instance updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SonarrSettings"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/public": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get public settings
         * @description Returns settings that are not protected or sensitive. Mainly used to determine if the application has been configured for the first time.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Public settings returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PublicSettings"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/initialize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Initialize application
         * @description Sets the app as initialized, allowing the user to navigate to pages other than the setup page.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Public settings returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PublicSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get scheduled jobs
         * @description Returns list of all scheduled jobs and details about their next execution time in a JSON array.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Scheduled jobs returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Job"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/jobs/{jobId}/run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Invoke a specific job
         * @description Invokes a specific job to run. Will return the new job status in JSON format.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    jobId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Invoked job returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Job"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/jobs/{jobId}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel a specific job
         * @description Cancels a specific job. Will return the new job status in JSON format.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    jobId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Canceled job returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Job"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/jobs/{jobId}/schedule": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Modify job schedule
         * @description Re-registers the job with the schedule specified. Will return the job in JSON format.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    jobId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @example 0 *\/5 * * * * */
                        schedule?: string;
                    };
                };
            };
            responses: {
                /** @description Rescheduled job */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Job"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/cache": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get a list of active caches
         * @description Retrieves a list of all active caches and their current stats.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Caches returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            imageCache?: {
                                tmdb?: {
                                    /** @example 123456 */
                                    size?: number;
                                    /** @example 123 */
                                    imageCount?: number;
                                };
                                avatar?: {
                                    /** @example 123456 */
                                    size?: number;
                                    /** @example 123 */
                                    imageCount?: number;
                                };
                            };
                            dnsCache?: {
                                stats?: {
                                    /** @example 1 */
                                    size?: number;
                                    /** @example 500 */
                                    maxSize?: number;
                                    /** @example 19 */
                                    hits?: number;
                                    /** @example 1 */
                                    misses?: number;
                                    /** @example 0 */
                                    failures?: number;
                                    /** @example 0 */
                                    ipv4Fallbacks?: number;
                                    /** @example 0.95 */
                                    hitRate?: number;
                                };
                                entries?: unknown[];
                            };
                            apiCaches?: {
                                /** @example cache-id */
                                id?: string;
                                /** @example cache name */
                                name?: string;
                                stats?: {
                                    hits?: number;
                                    misses?: number;
                                    keys?: number;
                                    ksize?: number;
                                    vsize?: number;
                                };
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/cache/{cacheId}/flush": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Flush a specific cache
         * @description Flushes all data from the cache ID provided
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    cacheId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Flushed cache */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/cache/dns/{dnsEntry}/flush": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Flush a specific DNS cache entry
         * @description Flushes a specific DNS cache entry
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    dnsEntry: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Flushed dns cache */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Returns logs
         * @description Returns list of all log items and details
         */
        get: {
            parameters: {
                query?: {
                    take?: number | null;
                    skip?: number | null;
                    filter?: "debug" | "info" | "warn" | "error" | null;
                    search?: string | null;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Server log returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example server */
                            label?: string;
                            /** @example info */
                            level?: string;
                            /** @example Server ready on port 5055 */
                            message?: string;
                            /** @example 2020-12-15T16:20:00.069Z */
                            timestamp?: string;
                        }[];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get email notification settings
         * @description Returns current email notification settings in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned email settings */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NotificationEmailSettings"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Update email notification settings
         * @description Updates email notification settings with provided values
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["NotificationEmailSettings"];
                };
            };
            responses: {
                /** @description Values were sucessfully updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NotificationEmailSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/email/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Test email settings
         * @description Sends a test notification to the email agent.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["NotificationEmailSettings"];
                };
            };
            responses: {
                /** @description Test notification attempted */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/discord": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Discord notification settings
         * @description Returns current Discord notification settings in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned Discord settings */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DiscordSettings"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Update Discord notification settings
         * @description Updates Discord notification settings with the provided values.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["DiscordSettings"];
                };
            };
            responses: {
                /** @description Values were sucessfully updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DiscordSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/discord/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Test Discord settings
         * @description Sends a test notification to the Discord agent.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["DiscordSettings"];
                };
            };
            responses: {
                /** @description Test notification attempted */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/pushbullet": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Pushbullet notification settings
         * @description Returns current Pushbullet notification settings in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned Pushbullet settings */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PushbulletSettings"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Update Pushbullet notification settings
         * @description Update Pushbullet notification settings with the provided values.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["PushbulletSettings"];
                };
            };
            responses: {
                /** @description Values were sucessfully updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PushbulletSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/pushbullet/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Test Pushbullet settings
         * @description Sends a test notification to the Pushbullet agent.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["PushbulletSettings"];
                };
            };
            responses: {
                /** @description Test notification attempted */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/pushover": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Pushover notification settings
         * @description Returns current Pushover notification settings in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned Pushover settings */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PushoverSettings"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Update Pushover notification settings
         * @description Update Pushover notification settings with the provided values.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["PushoverSettings"];
                };
            };
            responses: {
                /** @description Values were sucessfully updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PushoverSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/pushover/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Test Pushover settings
         * @description Sends a test notification to the Pushover agent.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["PushoverSettings"];
                };
            };
            responses: {
                /** @description Test notification attempted */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/pushover/sounds": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Pushover sounds
         * @description Returns valid Pushover sound options in a JSON array.
         */
        get: {
            parameters: {
                query: {
                    token: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned Pushover settings */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            name?: string;
                            description?: string;
                        }[];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/gotify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Gotify notification settings
         * @description Returns current Gotify notification settings in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned Gotify settings */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GotifySettings"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Update Gotify notification settings
         * @description Update Gotify notification settings with the provided values.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["GotifySettings"];
                };
            };
            responses: {
                /** @description Values were sucessfully updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GotifySettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/gotify/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Test Gotify settings
         * @description Sends a test notification to the Gotify agent.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["GotifySettings"];
                };
            };
            responses: {
                /** @description Test notification attempted */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/ntfy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get ntfy.sh notification settings
         * @description Returns current ntfy.sh notification settings in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned ntfy.sh settings */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NtfySettings"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Update ntfy.sh notification settings
         * @description Update ntfy.sh notification settings with the provided values.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["NtfySettings"];
                };
            };
            responses: {
                /** @description Values were sucessfully updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NtfySettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/ntfy/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Test ntfy.sh settings
         * @description Sends a test notification to the ntfy.sh agent.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["NtfySettings"];
                };
            };
            responses: {
                /** @description Test notification attempted */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/slack": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Slack notification settings
         * @description Returns current Slack notification settings in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned slack settings */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SlackSettings"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Update Slack notification settings
         * @description Updates Slack notification settings with the provided values.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SlackSettings"];
                };
            };
            responses: {
                /** @description Values were sucessfully updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SlackSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/slack/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Test Slack settings
         * @description Sends a test notification to the Slack agent.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SlackSettings"];
                };
            };
            responses: {
                /** @description Test notification attempted */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/telegram": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Telegram notification settings
         * @description Returns current Telegram notification settings in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned Telegram settings */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TelegramSettings"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Update Telegram notification settings
         * @description Update Telegram notification settings with the provided values.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["TelegramSettings"];
                };
            };
            responses: {
                /** @description Values were sucessfully updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TelegramSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/telegram/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Test Telegram settings
         * @description Sends a test notification to the Telegram agent.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["TelegramSettings"];
                };
            };
            responses: {
                /** @description Test notification attempted */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/webpush": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Web Push notification settings
         * @description Returns current Web Push notification settings in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned web push settings */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["WebPushSettings"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Update Web Push notification settings
         * @description Updates Web Push notification settings with the provided values.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["WebPushSettings"];
                };
            };
            responses: {
                /** @description Values were sucessfully updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["WebPushSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/webpush/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Test Web Push settings
         * @description Sends a test notification to the Web Push agent.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["WebPushSettings"];
                };
            };
            responses: {
                /** @description Test notification attempted */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/webhook": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get webhook notification settings
         * @description Returns current webhook notification settings in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned webhook settings */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["WebhookSettings"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Update webhook notification settings
         * @description Updates webhook notification settings with the provided values.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["WebhookSettings"];
                };
            };
            responses: {
                /** @description Values were sucessfully updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["WebhookSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/notifications/webhook/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Test webhook settings
         * @description Sends a test notification to the webhook agent.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["WebhookSettings"];
                };
            };
            responses: {
                /** @description Test notification attempted */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/discover": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get all discover sliders
         * @description Returns all discovery sliders. Built-in and custom made.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned all discovery sliders */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DiscoverSlider"][];
                    };
                };
            };
        };
        put?: never;
        /**
         * Batch update all sliders.
         * @description Batch update all sliders at once. Should also be used for creation. Will only update sliders provided
         *     and will not delete any sliders not present in the request. If a slider is missing a required field,
         *     it will be ignored. Requires the `ADMIN` permission.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["DiscoverSlider"][];
                };
            };
            responses: {
                /** @description Returned all newly updated discovery sliders */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DiscoverSlider"][];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/discover/{sliderId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Update a single slider
         * @description Updates a single slider and return the newly updated slider. Requires the `ADMIN` permission.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    sliderId: number;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @example Slider Title */
                        title?: string;
                        /** @example 1 */
                        type?: number;
                        /** @example 1 */
                        data?: string;
                    };
                };
            };
            responses: {
                /** @description Returns newly added discovery slider */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DiscoverSlider"];
                    };
                };
            };
        };
        post?: never;
        /**
         * Delete slider by ID
         * @description Deletes the slider with the provided sliderId. Requires the `ADMIN` permission.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    sliderId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Slider successfully deleted */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DiscoverSlider"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/discover/add": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Add a new slider
         * @description Add a single slider and return the newly created slider. Requires the `ADMIN` permission.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @example New Slider */
                        title?: string;
                        /** @example 1 */
                        type?: number;
                        /** @example 1 */
                        data?: string;
                    };
                };
            };
            responses: {
                /** @description Returns newly added discovery slider */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DiscoverSlider"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/discover/reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Reset all discover sliders
         * @description Resets all discovery sliders to the default values. Requires the `ADMIN` permission.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description All sliders reset to defaults */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings/about": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get server stats
         * @description Returns current server stats in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned about settings */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1.0.0 */
                            version?: string;
                            /** @example 100 */
                            totalRequests?: number;
                            /** @example 100 */
                            totalMediaItems?: number;
                            /** @example Asia/Tokyo */
                            tz?: string | null;
                            /** @example /app/config */
                            appDataPath?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get logged-in user
         * @description Returns the currently logged-in user.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Object containing the logged-in user in JSON */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/plex": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign in using a Plex token
         * @description Takes an `authToken` (Plex token) to log the user in. Generates a session cookie for use in further requests. If the user does not exist, and there are no other users, then a user will be created with full admin privileges. If a user logs in with access to the main Plex server, they will also have an account created, but without any permissions.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        authToken: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/jellyfin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign in using a Jellyfin username and password
         * @description Takes the user's username and password to log the user in. Generates a session cookie for use in further requests. If the user does not exist, and there are no other users, then a user will be created with full admin privileges. If a user logs in with access to the Jellyfin server, they will also have an account created, but without any permissions.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        username: string;
                        password: string;
                        hostname?: string;
                        email?: string;
                        serverType?: number;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/jellyfin/quickconnect/initiate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Initiate Jellyfin Quick Connect
         * @description Initiates a Quick Connect session and returns a code for the user to authorize on their Jellyfin server.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Quick Connect session initiated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 123456 */
                            code?: string;
                            /** @example abc123def456 */
                            secret?: string;
                        };
                    };
                };
                /** @description Failed to initiate Quick Connect */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/jellyfin/quickconnect/check": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Check Quick Connect authorization status
         * @description Checks if the Quick Connect code has been authorized by the user.
         */
        get: {
            parameters: {
                query: {
                    /** @description The secret returned from the initiate endpoint */
                    secret: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Authorization status returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example false */
                            authenticated?: boolean;
                        };
                    };
                };
                /** @description Quick Connect session not found or expired */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/jellyfin/quickconnect/authenticate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Authenticate with Quick Connect
         * @description Completes the Quick Connect authentication flow and creates a user session.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        secret: string;
                    };
                };
            };
            responses: {
                /** @description Successfully authenticated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"];
                    };
                };
                /** @description Quick Connect not authorized or access denied */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Authentication failed */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/local": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign in using a local account
         * @description Takes an `email` and a `password` to log the user in. Generates a session cookie for use in further requests.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        email: string;
                        password: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign out and clear session cookie
         * @description Completely clear the session cookie and associated values, effectively signing the user out.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example ok */
                            status?: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/reset-password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Send a reset password email
         * @description Sends a reset password email to the email if the user exists
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        email: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example ok */
                            status?: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/reset-password/{guid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reset the password for a user
         * @description Resets the password for a user if the given guid is connected to a user
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    guid: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        password: string;
                    };
                };
            };
            responses: {
                /** @description OK */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example ok */
                            status?: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get all users
         * @description Returns all users in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    take?: number | null;
                    skip?: number | null;
                    sort?: "created" | "updated" | "requests" | "displayname" | "usertype" | "role";
                    /**
                     * @description Sort direction. When omitted, the server chooses the direction per sort
                     *     field (e.g. displayname defaults to asc, requests/updated to desc).
                     */
                    sortDirection?: "asc" | "desc";
                    q?: string;
                    includeIds?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description A JSON array of all users */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            pageInfo?: components["schemas"]["PageInfo"];
                            results?: components["schemas"]["User"][];
                        };
                    };
                };
            };
        };
        /**
         * Update batch of users
         * @description Update users with given IDs with provided values in request `body.settings`. You cannot update users' Plex tokens through this request.
         *
         *     Requires the `MANAGE_USERS` permission.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        ids?: number[];
                        permissions?: number;
                    };
                };
            };
            responses: {
                /** @description Successfully updated user details */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"][];
                    };
                };
            };
        };
        /**
         * Create new user
         * @description Creates a new user. Requires the `MANAGE_USERS` permission.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @example hey@itsme.com */
                        email?: string;
                        username?: string;
                        permissions?: number;
                    };
                };
            };
            responses: {
                /** @description The created user */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/import-from-plex": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Import all users from Plex
         * @description Fetches and imports users from the Plex server. If a list of Plex IDs is provided in the request body, only the specified users will be imported. Otherwise, all users will be imported.
         *
         *     Requires the `MANAGE_USERS` permission.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        plexIds?: string[];
                    };
                };
            };
            responses: {
                /** @description A list of the newly created users */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"][];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/import-from-jellyfin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Import all users from Jellyfin
         * @description Fetches and imports users from the Jellyfin server.
         *
         *     Requires the `MANAGE_USERS` permission.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        jellyfinUserIds?: string[];
                    };
                };
            };
            responses: {
                /** @description A list of the newly created users */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"][];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/registerPushSubscription": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Register a web push /user/registerPushSubscription
         * @description Registers a web push subscription for the logged-in user
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        endpoint: string;
                        auth: string;
                        p256dh: string;
                        userAgent?: string;
                    };
                };
            };
            responses: {
                /** @description Successfully registered push subscription */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/{userId}/pushSubscriptions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get all web push notification settings for a user
         * @description Returns all web push notification settings for a user in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description User web push notification settings in JSON */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            endpoint?: string;
                            p256dh?: string;
                            auth?: string;
                            userAgent?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/{userId}/pushSubscription/{endpoint}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get web push notification settings for a user
         * @description Returns web push notification settings for a user in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                    endpoint: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description User web push notification settings in JSON */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            endpoint?: string;
                            p256dh?: string;
                            auth?: string;
                            userAgent?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /**
         * Delete user push subscription by key
         * @description Deletes the user push subscription with the provided key.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                    endpoint: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successfully removed user push subscription */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/{userId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get user by ID
         * @description Retrieves user details in a JSON object. Requires the `MANAGE_USERS` permission.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Users details in JSON */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"];
                    };
                };
            };
        };
        /**
         * Update a user by user ID
         * @description Update a user with the provided values. You cannot update a user's Plex token through this request.
         *
         *     Requires the `MANAGE_USERS` permission.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
            responses: {
                /** @description Successfully updated user details */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"];
                    };
                };
            };
        };
        post?: never;
        /**
         * Delete user by ID
         * @description Deletes the user with the provided userId. Requires the `MANAGE_USERS` permission.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description User successfully deleted */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/jellyfin/{jellyfinUserId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get user by Jellyfin user ID
         * @description Retrieves user details by Jellyfin user ID in a JSON object. Returns filtered data based on the caller's permissions.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description The Jellyfin user ID (32-character hexadecimal string) */
                    jellyfinUserId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description User details in JSON */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"];
                    };
                };
                /** @description User not found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/{userId}/requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get requests for a specific user
         * @description Retrieves a user's requests in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    take?: number | null;
                    skip?: number | null;
                };
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description User's requests returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            pageInfo?: components["schemas"]["PageInfo"];
                            results?: components["schemas"]["MediaRequest"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/{userId}/quota": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get quotas for a specific user
         * @description Returns quota details for a user in a JSON object. Requires `MANAGE_USERS` permission if viewing other users.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description User quota details in JSON */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            movie?: {
                                /** @example 7 */
                                days?: number;
                                /** @example 10 */
                                limit?: number;
                                /** @example 6 */
                                used?: number;
                                /** @example 4 */
                                remaining?: number;
                                /** @example false */
                                restricted?: boolean;
                            };
                            tv?: {
                                /** @example 7 */
                                days?: number;
                                /** @example 10 */
                                limit?: number;
                                /** @example 6 */
                                used?: number;
                                /** @example 4 */
                                remaining?: number;
                                /** @example false */
                                restricted?: boolean;
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/blocklist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Returns blocklisted items
         * @description Returns list of all blocklisted media
         */
        get: {
            parameters: {
                query?: {
                    take?: number | null;
                    skip?: number | null;
                    search?: string | null;
                    filter?: "all" | "manual" | "blocklistedTags";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Blocklisted items returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            pageInfo?: components["schemas"]["PageInfo"];
                            results?: {
                                user?: components["schemas"]["User"];
                                /** @example 2024-04-21T01:55:44.000Z */
                                createdAt?: string;
                                /** @example 1 */
                                id?: number;
                                /** @example movie */
                                mediaType?: string;
                                /** @example Dune */
                                title?: string;
                                /** @example 438631 */
                                tmdbId?: number;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /** Add media to blocklist */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["Blocklist"];
                };
            };
            responses: {
                /** @description Item succesfully blocklisted */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Item has already been blocklisted */
                412: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/blocklist/{tmdbId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get media from blocklist */
        get: {
            parameters: {
                query: {
                    mediaType: "movie" | "tv";
                };
                header?: never;
                path: {
                    /**
                     * @description tmdbId ID
                     * @example 1
                     */
                    tmdbId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Blocklist details in JSON */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        /** Remove media from blocklist */
        delete: {
            parameters: {
                query: {
                    mediaType: "movie" | "tv";
                };
                header?: never;
                path: {
                    /**
                     * @description tmdbId ID
                     * @example 1
                     */
                    tmdbId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Succesfully removed media item */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/blacklist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Returns blocklisted items
         * @deprecated
         * @description **DEPRECATED**: Use `/blocklist` instead. This endpoint will be deprecated soon.
         */
        get: {
            parameters: {
                query?: {
                    take?: number | null;
                    skip?: number | null;
                    search?: string | null;
                    filter?: "all" | "manual" | "blocklistedTags";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Blocklisted items returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            pageInfo?: components["schemas"]["PageInfo"];
                            results?: {
                                user?: components["schemas"]["User"];
                                /** @example 2024-04-21T01:55:44.000Z */
                                createdAt?: string;
                                /** @example 1 */
                                id?: number;
                                /** @example movie */
                                mediaType?: string;
                                /** @example Dune */
                                title?: string;
                                /** @example 438631 */
                                tmdbId?: number;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        /**
         * Add media to blocklist
         * @deprecated
         * @description **DEPRECATED**: Use `/blocklist` instead. This endpoint will be deprecated soon.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["Blocklist"];
                };
            };
            responses: {
                /** @description Item succesfully blocklisted */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Item has already been blocklisted */
                412: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/blacklist/{tmdbId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get media from blocklist
         * @deprecated
         * @description **DEPRECATED**: Use `/blocklist/{tmdbId}` instead. This endpoint will be deprecated soon.
         */
        get: {
            parameters: {
                query: {
                    mediaType: "movie" | "tv";
                };
                header?: never;
                path: {
                    /**
                     * @description tmdbId ID
                     * @example 1
                     */
                    tmdbId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Blocklist details in JSON */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        /**
         * Remove media from blocklist
         * @deprecated
         * @description **DEPRECATED**: Use `/blocklist/{tmdbId}` instead. This endpoint will be deprecated soon.
         */
        delete: {
            parameters: {
                query: {
                    mediaType: "movie" | "tv";
                };
                header?: never;
                path: {
                    /**
                     * @description tmdbId ID
                     * @example 1
                     */
                    tmdbId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Succesfully removed media item */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/blocklist/collection/{collectionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Add collection to blocklist
         * @description Adds all movies in a collection to the blocklist
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /**
                     * @description Collection ID
                     * @example 1424991
                     */
                    collectionId: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": Record<string, never>;
                };
            };
            responses: {
                /** @description Successfully added collection to blocklist */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Error adding collection to blocklist */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        /**
         * Remove collection from blocklist
         * @description Removes all movies in a collection from the blocklist
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /**
                     * @description Collection ID
                     * @example 1424991
                     */
                    collectionId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successfully removed collection from blocklist */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Error removing collection from blocklist */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/watchlist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Add media to watchlist */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["Watchlist"];
                };
            };
            responses: {
                /** @description Watchlist data returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Watchlist"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/watchlist/{tmdbId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete watchlist item
         * @description Removes a watchlist item.
         */
        delete: {
            parameters: {
                query: {
                    mediaType: "movie" | "tv";
                };
                header?: never;
                path: {
                    /**
                     * @description tmdbId ID
                     * @example 1
                     */
                    tmdbId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Succesfully removed watchlist item */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/{userId}/watchlist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get the Plex watchlist for a specific user
         * @description Retrieves a user's Plex Watchlist in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                };
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Watchlist data returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            page?: number;
                            totalPages?: number;
                            totalResults?: number;
                            results?: {
                                /** @example 1 */
                                tmdbId?: number;
                                ratingKey?: string;
                                type?: string;
                                title?: string;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/{userId}/settings/main": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get general settings for a user
         * @description Returns general settings for a specific user. Requires `MANAGE_USERS` permission if viewing other users.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description User general settings returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UserSettings"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Update general settings for a user
         * @description Updates and returns general settings for a specific user. Requires `MANAGE_USERS` permission if editing other users.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["UserSettings"];
                };
            };
            responses: {
                /** @description Updated user general settings returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UserSettings"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/{userId}/settings/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get password page informatiom
         * @description Returns important data for the password page to function correctly. Requires `MANAGE_USERS` permission if viewing other users.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description User password page information returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example true */
                            hasPassword?: boolean;
                        };
                    };
                };
            };
        };
        put?: never;
        /**
         * Update password for a user
         * @description Updates a user's password. Requires `MANAGE_USERS` permission if editing other users.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        currentPassword?: string | null;
                        newPassword: string;
                    };
                };
            };
            responses: {
                /** @description User password updated */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/{userId}/settings/linked-accounts/plex": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Link the provided Plex account to the current user
         * @description Logs in to Plex with the provided auth token, then links the associated Plex account with the user's account. Users can only link external accounts to their own account.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        authToken: string;
                    };
                };
            };
            responses: {
                /** @description Linking account succeeded */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Invalid credentials */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Account already linked to a user */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        /**
         * Remove the linked Plex account for a user
         * @description Removes the linked Plex account for a specific user. Requires `MANAGE_USERS` permission if editing other users.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Unlinking account succeeded */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Unlink request invalid */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description User does not exist */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/{userId}/settings/linked-accounts/jellyfin": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Link the provided Jellyfin account to the current user
         * @description Logs in to Jellyfin with the provided credentials, then links the associated Jellyfin account with the user's account. Users can only link external accounts to their own account.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @example Mr User */
                        username?: string;
                        /** @example supersecret */
                        password?: string;
                    };
                };
            };
            responses: {
                /** @description Linking account succeeded */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Invalid credentials */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Account already linked to a user */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        /**
         * Remove the linked Jellyfin account for a user
         * @description Removes the linked Jellyfin account for a specific user. Requires `MANAGE_USERS` permission if editing other users.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Unlinking account succeeded */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Unlink request invalid */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description User does not exist */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/{userId}/settings/linked-accounts/jellyfin/quickconnect": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Link Jellyfin/Emby account with Quick Connect
         * @description Links a Jellyfin/Emby account to the user's profile using Quick Connect authentication
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        secret: string;
                    };
                };
            };
            responses: {
                /** @description Account successfully linked */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Invalid Quick Connect secret */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Unauthorized */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Account already linked */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/{userId}/settings/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get notification settings for a user
         * @description Returns notification settings for a specific user. Requires `MANAGE_USERS` permission if viewing other users.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description User notification settings returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UserSettingsNotifications"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Update notification settings for a user
         * @description Updates and returns notification settings for a specific user. Requires `MANAGE_USERS` permission if editing other users.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["UserSettingsNotifications"];
                };
            };
            responses: {
                /** @description Updated user notification settings returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["UserSettingsNotifications"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/{userId}/settings/permissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get permission settings for a user
         * @description Returns permission settings for a specific user. Requires `MANAGE_USERS` permission if viewing other users.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description User permission settings returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 2 */
                            permissions?: number;
                        };
                    };
                };
            };
        };
        put?: never;
        /**
         * Update permission settings for a user
         * @description Updates and returns permission settings for a specific user. Requires `MANAGE_USERS` permission if editing other users.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        permissions: number;
                    };
                };
            };
            responses: {
                /** @description Updated user general settings returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 2 */
                            permissions?: number;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/user/{userId}/watch_data": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get watch data
         * @description Returns play count, play duration, and recently watched media.
         *
         *     Requires the `ADMIN` permission to fetch results for other users.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    userId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Users */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            recentlyWatched?: components["schemas"]["MediaInfo"][];
                            playCount?: number;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Search for movies, TV shows, or people
         * @description Returns a list of movies, TV shows, or people a JSON object.
         */
        get: {
            parameters: {
                query: {
                    query: string;
                    page?: number;
                    language?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            results?: (components["schemas"]["MovieResult"] | components["schemas"]["TvResult"] | components["schemas"]["PersonResult"])[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/search/keyword": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Search for keywords
         * @description Returns a list of TMDB keywords matching the search query
         */
        get: {
            parameters: {
                query: {
                    query: string;
                    page?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            results?: components["schemas"]["Keyword"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/search/company": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Search for companies
         * @description Returns a list of TMDB companies matching the search query. (Will not return origin country)
         */
        get: {
            parameters: {
                query: {
                    query: string;
                    page?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            results?: components["schemas"]["Company"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/discover/movies": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Discover movies
         * @description Returns a list of movies in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    language?: string;
                    genre?: string;
                    studio?: number;
                    keywords?: string;
                    /** @description Comma-separated list of keyword IDs to exclude from results */
                    excludeKeywords?: string;
                    sortBy?: string;
                    primaryReleaseDateGte?: string;
                    primaryReleaseDateLte?: string;
                    withRuntimeGte?: number;
                    withRuntimeLte?: number;
                    voteAverageGte?: number;
                    voteAverageLte?: number;
                    voteCountGte?: number;
                    voteCountLte?: number;
                    watchRegion?: string;
                    watchProviders?: string;
                    /** @description Exact certification to filter by (used when certificationMode is 'exact') */
                    certification?: string;
                    /** @description Minimum certification to filter by (used when certificationMode is 'range') */
                    certificationGte?: string;
                    /** @description Maximum certification to filter by (used when certificationMode is 'range') */
                    certificationLte?: string;
                    /** @description Country code for the certification system (e.g., US, GB, CA) */
                    certificationCountry?: string;
                    /** @description Determines whether to use exact certification matching or a certification range (internal use only, not sent to TMDB API) */
                    certificationMode?: "exact" | "range";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            results?: components["schemas"]["MovieResult"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/discover/movies/genre/{genreId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Discover movies by genre
         * @description Returns a list of movies based on the provided genre ID in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    language?: string;
                };
                header?: never;
                path: {
                    genreId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            genre?: components["schemas"]["Genre"];
                            results?: components["schemas"]["MovieResult"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/discover/movies/language/{language}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Discover movies by original language
         * @description Returns a list of movies based on the provided ISO 639-1 language code in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    language?: string;
                };
                header?: never;
                path: {
                    language: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            language?: components["schemas"]["SpokenLanguage"];
                            results?: components["schemas"]["MovieResult"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/discover/movies/studio/{studioId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Discover movies by studio
         * @description Returns a list of movies based on the provided studio ID in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    language?: string;
                };
                header?: never;
                path: {
                    studioId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            studio?: components["schemas"]["ProductionCompany"];
                            results?: components["schemas"]["MovieResult"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/discover/movies/upcoming": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Upcoming movies
         * @description Returns a list of movies in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    language?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            results?: components["schemas"]["MovieResult"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/discover/tv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Discover TV shows
         * @description Returns a list of TV shows in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    language?: string;
                    genre?: string;
                    network?: number;
                    keywords?: string;
                    /** @description Comma-separated list of keyword IDs to exclude from results */
                    excludeKeywords?: string;
                    sortBy?: string;
                    firstAirDateGte?: string;
                    firstAirDateLte?: string;
                    withRuntimeGte?: number;
                    withRuntimeLte?: number;
                    voteAverageGte?: number;
                    voteAverageLte?: number;
                    voteCountGte?: number;
                    voteCountLte?: number;
                    watchRegion?: string;
                    watchProviders?: string;
                    status?: string;
                    /** @description Exact certification to filter by (used when certificationMode is 'exact') */
                    certification?: string;
                    /** @description Minimum certification to filter by (used when certificationMode is 'range') */
                    certificationGte?: string;
                    /** @description Maximum certification to filter by (used when certificationMode is 'range') */
                    certificationLte?: string;
                    /** @description Country code for the certification system (e.g., US, GB, CA) */
                    certificationCountry?: string;
                    /** @description Determines whether to use exact certification matching or a certification range (internal use only, not sent to TMDB API) */
                    certificationMode?: "exact" | "range";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            results?: components["schemas"]["TvResult"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/discover/tv/language/{language}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Discover TV shows by original language
         * @description Returns a list of TV shows based on the provided ISO 639-1 language code in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    language?: string;
                };
                header?: never;
                path: {
                    language: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            language?: components["schemas"]["SpokenLanguage"];
                            results?: components["schemas"]["TvResult"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/discover/tv/genre/{genreId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Discover TV shows by genre
         * @description Returns a list of TV shows based on the provided genre ID in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    language?: string;
                };
                header?: never;
                path: {
                    genreId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            genre?: components["schemas"]["Genre"];
                            results?: components["schemas"]["TvResult"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/discover/tv/network/{networkId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Discover TV shows by network
         * @description Returns a list of TV shows based on the provided network ID in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    language?: string;
                };
                header?: never;
                path: {
                    networkId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            network?: components["schemas"]["Network"];
                            results?: components["schemas"]["TvResult"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/discover/tv/upcoming": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Discover Upcoming TV shows
         * @description Returns a list of upcoming TV shows in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    language?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            results?: components["schemas"]["TvResult"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/discover/trending": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Trending movies and TV
         * @description Returns a list of movies and TV shows in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    language?: string;
                    mediaType?: "all" | "movie" | "tv";
                    timeWindow?: "day" | "week";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            results?: (components["schemas"]["MovieResult"] | components["schemas"]["TvResult"] | components["schemas"]["PersonResult"])[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/discover/keyword/{keywordId}/movies": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get movies from keyword
         * @description Returns list of movies based on the provided keyword ID a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    language?: string;
                };
                header?: never;
                path: {
                    keywordId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description List of movies */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            results?: components["schemas"]["MovieResult"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/discover/genreslider/movie": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get genre slider data for movies
         * @description Returns a list of genres with backdrops attached
         */
        get: {
            parameters: {
                query?: {
                    language?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Genre slider data returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            id?: number;
                            backdrops?: string[];
                            /** @example Genre Name */
                            name?: string;
                        }[];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/discover/genreslider/tv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get genre slider data for TV series
         * @description Returns a list of genres with backdrops attached
         */
        get: {
            parameters: {
                query?: {
                    language?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Genre slider data returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            id?: number;
                            backdrops?: string[];
                            /** @example Genre Name */
                            name?: string;
                        }[];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/discover/watchlist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get the Plex watchlist. */
        get: {
            parameters: {
                query?: {
                    page?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Watchlist data returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            page?: number;
                            totalPages?: number;
                            totalResults?: number;
                            results?: {
                                /** @example 1 */
                                tmdbId?: number;
                                ratingKey?: string;
                                type?: string;
                                title?: string;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get all requests
         * @description Returns all requests if the user has the `ADMIN` or `MANAGE_REQUESTS` permissions. Otherwise, only the logged-in user's requests are returned.
         *
         *     If the `requestedBy` parameter is specified, only requests from that particular user ID will be returned.
         */
        get: {
            parameters: {
                query?: {
                    take?: number | null;
                    skip?: number | null;
                    filter?: "all" | "approved" | "available" | "pending" | "processing" | "unavailable" | "failed" | "deleted" | "completed" | null;
                    sort?: "added" | "modified";
                    sortDirection?: "asc" | "desc" | null;
                    requestedBy?: number | null;
                    mediaType?: "movie" | "tv" | "all" | null;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Requests returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            pageInfo?: components["schemas"]["PageInfo"];
                            results?: components["schemas"]["MediaRequest"][];
                        };
                    };
                };
            };
        };
        put?: never;
        /**
         * Create new request
         * @description Creates a new request with the provided media ID and type. The `REQUEST` permission is required.
         *
         *     If the user has the `ADMIN` or `AUTO_APPROVE` permissions, their request will be auomatically approved.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /**
                         * @example movie
                         * @enum {string}
                         */
                        mediaType: "movie" | "tv";
                        /** @example 123 */
                        mediaId: number;
                        /** @example 123 */
                        tvdbId?: number;
                        seasons?: number[] | "all";
                        /** @example false */
                        is4k?: boolean;
                        serverId?: number;
                        profileId?: number;
                        rootFolder?: string;
                        languageProfileId?: number;
                        userId?: number | null;
                        /**
                         * @description If true, this request will not count against the user's quota. Requires MANAGE_REQUESTS permission.
                         * @example false
                         */
                        ignoreQuota?: boolean;
                    };
                };
            };
            responses: {
                /** @description Succesfully created the request */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MediaRequest"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/request/count": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Gets request counts
         * @description Returns the number of requests by status including pending, approved, available, and completed requests.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Request counts returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            total?: number;
                            movie?: number;
                            tv?: number;
                            pending?: number;
                            approved?: number;
                            declined?: number;
                            processing?: number;
                            available?: number;
                            completed?: number;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/request/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get MediaRequest
         * @description Returns a specific MediaRequest in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /**
                     * @description Request ID
                     * @example 1
                     */
                    requestId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Succesfully returns request */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MediaRequest"];
                    };
                };
            };
        };
        /**
         * Update MediaRequest
         * @description Updates a specific media request and returns the request in a JSON object. Requires the `MANAGE_REQUESTS` permission.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /**
                     * @description Request ID
                     * @example 1
                     */
                    requestId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        mediaType: "movie" | "tv";
                        seasons?: number[];
                        /** @example false */
                        is4k?: boolean;
                        serverId?: number;
                        profileId?: number;
                        rootFolder?: string;
                        languageProfileId?: number;
                        userId?: number | null;
                    };
                };
            };
            responses: {
                /** @description Succesfully updated request */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MediaRequest"];
                    };
                };
            };
        };
        post?: never;
        /**
         * Delete request
         * @description Removes a request. If the user has the `MANAGE_REQUESTS` permission, any request can be removed. Otherwise, only pending requests can be removed.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /**
                     * @description Request ID
                     * @example 1
                     */
                    requestId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Succesfully removed request */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/request/{requestId}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Retry failed request
         * @description Retries a request by resending requests to Sonarr or Radarr.
         *
         *     Requires the `MANAGE_REQUESTS` permission or `ADMIN`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Request ID */
                    requestId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Retry triggered */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MediaRequest"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/request/{requestId}/{status}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Update a request's status
         * @description Updates a request's status to approved or declined. Also returns the request in a JSON object.
         *
         *     Requires the `MANAGE_REQUESTS` permission or `ADMIN`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Request ID */
                    requestId: string;
                    /** @description New status */
                    status: "approve" | "decline";
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Request status changed */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MediaRequest"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/movie/{movieId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get movie details
         * @description Returns full movie details in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    language?: string;
                };
                header?: never;
                path: {
                    movieId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Movie details */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MovieDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/movie/{movieId}/recommendations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get recommended movies
         * @description Returns list of recommended movies based on provided movie ID in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    language?: string;
                };
                header?: never;
                path: {
                    movieId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description List of movies */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            results?: components["schemas"]["MovieResult"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/movie/{movieId}/similar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get similar movies
         * @description Returns list of similar movies based on the provided movieId in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    language?: string;
                };
                header?: never;
                path: {
                    movieId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description List of movies */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            results?: components["schemas"]["MovieResult"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/movie/{movieId}/ratings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get movie ratings
         * @description Returns ratings based on the provided movieId in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    movieId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Ratings returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example Mulan */
                            title?: string;
                            /** @example 2020 */
                            year?: number;
                            /** @example http://www.rottentomatoes.com/m/mulan_2020/ */
                            url?: string;
                            /** @example 85 */
                            criticsScore?: number;
                            /** @enum {string} */
                            criticsRating?: "Rotten" | "Fresh" | "Certified Fresh";
                            /** @example 65 */
                            audienceScore?: number;
                            /** @enum {string} */
                            audienceRating?: "Spilled" | "Upright";
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/movie/{movieId}/ratingscombined": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get RT and IMDB movie ratings combined
         * @description Returns ratings from RottenTomatoes and IMDB based on the provided movieId in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    movieId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Ratings returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            rt?: {
                                /** @example Mulan */
                                title?: string;
                                /** @example 2020 */
                                year?: number;
                                /** @example http://www.rottentomatoes.com/m/mulan_2020/ */
                                url?: string;
                                /** @example 85 */
                                criticsScore?: number;
                                /** @enum {string} */
                                criticsRating?: "Rotten" | "Fresh" | "Certified Fresh";
                                /** @example 65 */
                                audienceScore?: number;
                                /** @enum {string} */
                                audienceRating?: "Spilled" | "Upright";
                            };
                            imdb?: {
                                /** @example I am Legend */
                                title?: string;
                                /** @example https://www.imdb.com/title/tt0480249 */
                                url?: string;
                                /** @example 6.5 */
                                criticsScore?: number;
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tv/{tvId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get TV details
         * @description Returns full TV details in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    language?: string;
                };
                header?: never;
                path: {
                    tvId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description TV details */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TvDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tv/{tvId}/season/{seasonNumber}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get season details and episode list
         * @description Returns season details with a list of episodes in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    language?: string;
                };
                header?: never;
                path: {
                    tvId: number;
                    seasonNumber: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description TV details */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Season"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tv/{tvId}/recommendations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get recommended TV series
         * @description Returns list of recommended TV series based on the provided tvId in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    language?: string;
                };
                header?: never;
                path: {
                    tvId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description List of TV series */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            results?: components["schemas"]["TvResult"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tv/{tvId}/similar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get similar TV series
         * @description Returns list of similar TV series based on the provided tvId in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    language?: string;
                };
                header?: never;
                path: {
                    tvId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description List of TV series */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 1 */
                            page?: number;
                            /** @example 20 */
                            totalPages?: number;
                            /** @example 200 */
                            totalResults?: number;
                            results?: components["schemas"]["TvResult"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tv/{tvId}/ratings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get TV ratings
         * @description Returns ratings based on provided tvId in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    tvId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Ratings returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example The Boys */
                            title?: string;
                            /** @example 2019 */
                            year?: number;
                            /** @example http://www.rottentomatoes.com/m/mulan_2020/ */
                            url?: string;
                            /** @example 85 */
                            criticsScore?: number;
                            /** @enum {string} */
                            criticsRating?: "Rotten" | "Fresh";
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/person/{personId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get person details
         * @description Returns person details based on provided personId in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    language?: string;
                };
                header?: never;
                path: {
                    personId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned person */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PersonDetails"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/person/{personId}/combined_credits": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get combined credits
         * @description Returns the person's combined credits based on the provided personId in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    language?: string;
                };
                header?: never;
                path: {
                    personId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned combined credits */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            cast?: components["schemas"]["CreditCast"][];
                            crew?: components["schemas"]["CreditCrew"][];
                            id?: number;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/media": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get media
         * @description Returns all media (can be filtered and limited) in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    take?: number | null;
                    skip?: number | null;
                    filter?: "all" | "available" | "partial" | "allavailable" | "processing" | "pending" | "deleted" | null;
                    sort?: "added" | "modified" | "mediaAdded";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Returned media */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            pageInfo?: components["schemas"]["PageInfo"];
                            results?: components["schemas"]["MediaInfo"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/media/{mediaId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete media item
         * @description Removes a media item. The `MANAGE_REQUESTS` permission is required to perform this action.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /**
                     * @description Media ID
                     * @example 1
                     */
                    mediaId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Succesfully removed media item */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/media/{mediaId}/file": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete media file
         * @description Removes a media file from radarr/sonarr. The `ADMIN` permission is required to perform this action.
         */
        delete: {
            parameters: {
                query?: {
                    /**
                     * @description Whether to remove from 4K service instance (true) or regular service instance (false)
                     * @example false
                     */
                    is4k?: boolean;
                };
                header?: never;
                path: {
                    /**
                     * @description Media ID
                     * @example 1
                     */
                    mediaId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successfully removed media item */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/media/{mediaId}/{status}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Update media status
         * @description Updates a media item's status and returns the media in JSON format
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /**
                     * @description Media ID
                     * @example 1
                     */
                    mediaId: string;
                    /**
                     * @description New status
                     * @example available
                     */
                    status: "available" | "partial" | "processing" | "pending" | "unknown" | "deleted";
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /**
                         * @description When true, updates the 4K status field (status4k).
                         *     When false or not provided, updates the regular status field (status).
                         *     This applies to all status values (available, partial, processing, pending, unknown).
                         * @example false
                         */
                        is4k?: boolean;
                    };
                };
            };
            responses: {
                /** @description Returned media */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MediaInfo"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/media/{mediaId}/watch_data": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get watch data
         * @description Returns play count, play duration, and users who have watched the media.
         *
         *     Requires the `ADMIN` permission.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /**
                     * @description Media ID
                     * @example 1
                     */
                    mediaId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Users */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            data?: {
                                playCount7Days?: number;
                                playCount30Days?: number;
                                playCount?: number;
                                users?: components["schemas"]["User"][];
                            };
                            data4k?: {
                                playCount7Days?: number;
                                playCount30Days?: number;
                                playCount?: number;
                                users?: components["schemas"]["User"][];
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/collection/{collectionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get collection details
         * @description Returns full collection details in a JSON object.
         */
        get: {
            parameters: {
                query?: {
                    language?: string;
                };
                header?: never;
                path: {
                    collectionId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Collection details */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Collection"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/service/radarr": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get non-sensitive Radarr server list
         * @description Returns a list of Radarr server IDs and names in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Request successful */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RadarrSettings"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/service/radarr/{radarrId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Radarr server quality profiles and root folders
         * @description Returns a Radarr server's quality profile and root folder details in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    radarrId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Request successful */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            server?: components["schemas"]["RadarrSettings"];
                            profiles?: components["schemas"]["ServiceProfile"];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/service/sonarr": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get non-sensitive Sonarr server list
         * @description Returns a list of Sonarr server IDs and names in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Request successful */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SonarrSettings"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/service/sonarr/{sonarrId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Sonarr server quality profiles and root folders
         * @description Returns a Sonarr server's quality profile and root folder details in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    sonarrId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Request successful */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            server?: components["schemas"]["SonarrSettings"];
                            profiles?: components["schemas"]["ServiceProfile"];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/service/sonarr/lookup/{tmdbId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get series from Sonarr
         * @description Returns a list of series returned by searching for the name in Sonarr.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    tmdbId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Request successful */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SonarrSeries"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/regions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Regions supported by TMDB
         * @description Returns a list of regions in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example US */
                            iso_3166_1?: string;
                            /** @example United States of America */
                            english_name?: string;
                        }[];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/languages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Languages supported by TMDB
         * @description Returns a list of languages in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example en */
                            iso_639_1?: string;
                            /** @example English */
                            english_name?: string;
                            /** @example English */
                            name?: string;
                        }[];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/studio/{studioId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get movie studio details
         * @description Returns movie studio details in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    studioId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Movie studio details */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProductionCompany"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/network/{networkId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get TV network details
         * @description Returns TV network details in a JSON object.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    networkId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description TV network details */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProductionCompany"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/genres/movie": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get list of official TMDB movie genres
         * @description Returns a list of genres in a JSON array.
         */
        get: {
            parameters: {
                query?: {
                    language?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 10751 */
                            id?: number;
                            /** @example Family */
                            name?: string;
                        }[];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/genres/tv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get list of official TMDB movie genres
         * @description Returns a list of genres in a JSON array.
         */
        get: {
            parameters: {
                query?: {
                    language?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 18 */
                            id?: number;
                            /** @example Drama */
                            name?: string;
                        }[];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/backdrops": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get backdrops of trending items
         * @description Returns a list of backdrop image paths in a JSON array.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Results */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": string[];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/issue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get all issues
         * @description Returns a list of issues in JSON format.
         */
        get: {
            parameters: {
                query?: {
                    take?: number | null;
                    skip?: number | null;
                    sort?: "added" | "modified";
                    filter?: "all" | "open" | "resolved";
                    requestedBy?: number | null;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Issues returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            pageInfo?: components["schemas"]["PageInfo"];
                            results?: components["schemas"]["Issue"][];
                        };
                    };
                };
            };
        };
        put?: never;
        /**
         * Create new issue
         * @description Creates a new issue
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        issueType?: number;
                        message?: string;
                        mediaId?: number;
                        userId?: number | null;
                    };
                };
            };
            responses: {
                /** @description Succesfully created the issue */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Issue"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/issue/count": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Gets issue counts
         * @description Returns the number of open and closed issues, as well as the number of issues of each type.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Issue counts returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            total?: number;
                            video?: number;
                            audio?: number;
                            subtitles?: number;
                            others?: number;
                            open?: number;
                            closed?: number;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/issue/{issueId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get issue
         * @description Returns a single issue in JSON format.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    issueId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Issues returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Issue"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        /**
         * Delete issue
         * @description Removes an issue. If the user has the `MANAGE_ISSUES` permission, any issue can be removed. Otherwise, only a users own issues can be removed.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /**
                     * @description Issue ID
                     * @example 1
                     */
                    issueId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Succesfully removed issue */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/issue/{issueId}/comment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create a comment
         * @description Creates a comment and returns associated issue in JSON format.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    issueId: number;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        message: string;
                    };
                };
            };
            responses: {
                /** @description Issue returned with new comment */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Issue"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/issueComment/{commentId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get issue comment
         * @description Returns a single issue comment in JSON format.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    commentId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Comment returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["IssueComment"];
                    };
                };
            };
        };
        /**
         * Update issue comment
         * @description Updates and returns a single issue comment in JSON format.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    commentId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        message?: string;
                    };
                };
            };
            responses: {
                /** @description Comment updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["IssueComment"];
                    };
                };
            };
        };
        post?: never;
        /**
         * Delete issue comment
         * @description Deletes an issue comment. Only users with `MANAGE_ISSUES` or the user who created the comment can perform this action.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /**
                     * @description Issue Comment ID
                     * @example 1
                     */
                    commentId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Succesfully removed issue comment */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/issue/{issueId}/{status}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Update an issue's status
         * @description Updates an issue's status to approved or declined. Also returns the issue in a JSON object.
         *
         *     Requires the `MANAGE_ISSUES` permission or `ADMIN`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Issue ID */
                    issueId: string;
                    /** @description New status */
                    status: "open" | "resolved";
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Issue status changed */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Issue"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/keyword/{keywordId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get keyword
         * @description Returns a single keyword in JSON format.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    keywordId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Keyword returned (null if not found) */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Keyword"];
                    };
                };
                /** @description Internal server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example Unable to retrieve keyword data. */
                            message?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/watchproviders/regions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get watch provider regions
         * @description Returns a list of all available watch provider regions.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Watch provider regions returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["WatchProviderRegion"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/watchproviders/movies": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get watch provider movies
         * @description Returns a list of all available watch providers for movies.
         */
        get: {
            parameters: {
                query: {
                    watchRegion: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Watch providers for movies returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["WatchProviderDetails"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/watchproviders/tv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get watch provider series
         * @description Returns a list of all available watch providers for series.
         */
        get: {
            parameters: {
                query: {
                    watchRegion: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Watch providers for series returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["WatchProviderDetails"][];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/certifications/movie": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get movie certifications
         * @description Returns list of movie certifications from TMDB.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Movie certifications returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CertificationResponse"];
                    };
                };
                /** @description Unable to retrieve movie certifications */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 500 */
                            status?: number;
                            /** @example Unable to retrieve movie certifications. */
                            message?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/certifications/tv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get TV certifications
         * @description Returns list of TV show certifications from TMDB.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description TV certifications returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CertificationResponse"];
                    };
                };
                /** @description Unable to retrieve TV certifications */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example 500 */
                            status?: number;
                            /** @example Unable to retrieve TV certifications. */
                            message?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/overrideRule": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get override rules
         * @description Returns a list of all override rules with their conditions and settings
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Override rules returned */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OverrideRule"][];
                    };
                };
            };
        };
        put?: never;
        /**
         * Create override rule
         * @description Creates a new Override Rule from the request body.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Values were successfully created */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OverrideRule"][];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/overrideRule/{ruleId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Update override rule
         * @description Updates an Override Rule from the request body.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    ruleId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Values were successfully updated */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OverrideRule"][];
                    };
                };
            };
        };
        post?: never;
        /**
         * Delete override rule by ID
         * @description Deletes the override rule with the provided ruleId.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    ruleId: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Override rule successfully deleted */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["OverrideRule"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Blocklist: {
            /** @example 1 */
            tmdbId?: number;
            title?: string;
            media?: components["schemas"]["MediaInfo"];
            /** @example 1 */
            userId?: number;
        };
        Watchlist: {
            /** @example 1 */
            readonly id?: number;
            /** @example 1 */
            tmdbId?: number;
            ratingKey?: string;
            type?: string;
            title?: string;
            media?: components["schemas"]["MediaInfo"];
            /** @example 2020-09-12T10:00:27.000Z */
            readonly createdAt?: string;
            /** @example 2020-09-12T10:00:27.000Z */
            readonly updatedAt?: string;
            requestedBy?: components["schemas"]["User"];
        };
        User: {
            /** @example 1 */
            readonly id: number;
            /** @example hey@itsme.com */
            readonly email: string;
            username?: string;
            readonly plexUsername?: string;
            readonly plexToken?: string;
            readonly jellyfinAuthToken?: string;
            /** @example 1 */
            readonly userType?: number;
            /** @example 0 */
            permissions?: number;
            readonly avatar?: string;
            /** @example 2020-09-02T05:02:23.000Z */
            readonly createdAt: string;
            /** @example 2020-09-02T05:02:23.000Z */
            readonly updatedAt: string;
            /** @example 5 */
            readonly requestCount?: number;
        };
        UserSettings: {
            /** @example Mr User */
            username?: string | null;
            /** @example user@example.com */
            email?: string;
            /** @example en */
            locale?: string | null;
            /** @example US */
            discoverRegion?: string | null;
            /** @example US */
            streamingRegion?: string | null;
            /** @example en */
            originalLanguage?: string | null;
            /**
             * @description Maximum number of movie requests allowed
             * @example 10
             */
            movieQuotaLimit?: number | null;
            /**
             * @description Time period in days for movie quota
             * @example 30
             */
            movieQuotaDays?: number | null;
            /**
             * @description Maximum number of TV requests allowed
             * @example 5
             */
            tvQuotaLimit?: number | null;
            /**
             * @description Time period in days for TV quota
             * @example 14
             */
            tvQuotaDays?: number | null;
            /**
             * @description Global movie quota days setting
             * @example 30
             */
            globalMovieQuotaDays?: number | null;
            /**
             * @description Global movie quota limit setting
             * @example 10
             */
            globalMovieQuotaLimit?: number | null;
            /**
             * @description Global TV quota limit setting
             * @example 5
             */
            globalTvQuotaLimit?: number | null;
            /**
             * @description Global TV quota days setting
             * @example 14
             */
            globalTvQuotaDays?: number | null;
            /**
             * @description Enable watchlist sync for movies
             * @example true
             */
            watchlistSyncMovies?: boolean | null;
            /**
             * @description Enable watchlist sync for TV
             * @example false
             */
            watchlistSyncTv?: boolean | null;
        };
        MainSettings: {
            readonly apiKey?: string;
            /** @example en */
            appLanguage?: string;
            /** @example Seerr */
            applicationTitle?: string;
            /** @example https://os.example.com */
            applicationUrl?: string;
            /** @example false */
            hideAvailable?: boolean;
            /** @example false */
            partialRequestsEnabled?: boolean;
            /** @example true */
            localLogin?: boolean;
            /** @example 1 */
            mediaServerType?: number;
            /** @example true */
            newPlexLogin?: boolean;
            /** @example 32 */
            defaultPermissions?: number;
            /** @example false */
            enableSpecialEpisodes?: boolean;
            /** @example false */
            versionCheck?: boolean;
        };
        NetworkSettings: {
            /** @example false */
            csrfProtection?: boolean;
            /** @example false */
            forceIpv4First?: boolean;
            /** @example false */
            trustProxy?: boolean;
            proxy?: {
                /** @example false */
                enabled?: boolean;
                /** @example  */
                hostname?: string;
                /** @example 8080 */
                port?: number;
                /** @example false */
                useSsl?: boolean;
                /** @example  */
                user?: string;
                /** @example  */
                password?: string;
                /** @example  */
                bypassFilter?: string;
                /** @example true */
                bypassLocalAddresses?: boolean;
            };
            dnsCache?: {
                /** @example false */
                enabled?: boolean;
                /** @example 0 */
                forceMinTtl?: number;
                /** @example -1 */
                forceMaxTtl?: number;
            };
        };
        PlexLibrary: {
            id: string;
            /** @example Movies */
            name: string;
            /** @example false */
            enabled: boolean;
        };
        PlexSettings: {
            /** @example Main Server */
            readonly name: string;
            /** @example 1234123412341234 */
            readonly machineId: string;
            /** @example 127.0.0.1 */
            ip: string;
            /** @example 32400 */
            port: number;
            useSsl?: boolean | null;
            readonly libraries?: components["schemas"]["PlexLibrary"][];
            /** @example https://app.plex.tv/desktop */
            webAppUrl?: string | null;
        };
        PlexConnection: {
            /** @example https */
            protocol: string;
            /** @example 127.0.0.1 */
            address: string;
            /** @example 32400 */
            port: number;
            /** @example https://127-0-0-1.2ab6ce1a093d465e910def96cf4e4799.plex.direct:32400 */
            uri: string;
            /** @example true */
            local: boolean;
            /** @example 200 */
            status?: number;
            /** @example OK */
            message?: string;
        };
        PlexDevice: {
            /** @example My Plex Server */
            name: string;
            /** @example Plex Media Server */
            product: string;
            /** @example 1.21 */
            productVersion: string;
            /** @example Linux */
            platform: string;
            /** @example default/linux/amd64/17.1/systemd */
            platformVersion?: string;
            /** @example PC */
            device: string;
            /** @example 85a943ce-a0cc-4d2a-a4ec-f74f06e40feb */
            clientIdentifier: string;
            /** @example 2021-01-01T00:00:00.000Z */
            createdAt: string;
            /** @example 2021-01-01T00:00:00.000Z */
            lastSeenAt: string;
            provides: string[];
            /** @example true */
            owned: boolean;
            /** @example 12345 */
            ownerID?: string;
            /** @example true */
            home?: boolean;
            /** @example xyzabc */
            sourceTitle?: string;
            /** @example supersecretaccesstoken */
            accessToken?: string;
            /** @example 127.0.0.1 */
            publicAddress?: string;
            /** @example true */
            httpsRequired?: boolean;
            /** @example true */
            synced?: boolean;
            /** @example true */
            relay?: boolean;
            /** @example false */
            dnsRebindingProtection?: boolean;
            /** @example false */
            natLoopbackSupported?: boolean;
            /** @example false */
            publicAddressMatches?: boolean;
            /** @example true */
            presence?: boolean;
            connection: components["schemas"]["PlexConnection"][];
        };
        JellyfinLibrary: {
            id: string;
            /** @example Movies */
            name: string;
            /** @example false */
            enabled: boolean;
        };
        JellyfinSettings: {
            /** @example Main Server */
            readonly name?: string;
            /** @example http://my.jellyfin.host */
            hostname?: string;
            /** @example http://my.jellyfin.host */
            externalHostname?: string;
            /** @example http://my.jellyfin.host/web/index.html#!/forgotpassword.html */
            jellyfinForgotPasswordUrl?: string;
            /** @example admin */
            adminUser?: string;
            /** @example mypassword */
            adminPass?: string;
            readonly libraries?: components["schemas"]["JellyfinLibrary"][];
            readonly serverID?: string;
        };
        MetadataSettings: {
            settings?: {
                /**
                 * @example tvdb
                 * @enum {string}
                 */
                tv?: "tvdb" | "tmdb";
                /**
                 * @example tvdb
                 * @enum {string}
                 */
                anime?: "tvdb" | "tmdb";
            };
        };
        TautulliSettings: {
            /** @example tautulli.example.com */
            hostname?: string | null;
            /** @example 8181 */
            port?: number | null;
            useSsl?: boolean | null;
            apiKey?: string | null;
            externalUrl?: string | null;
        };
        RadarrSettings: {
            /** @example 0 */
            readonly id?: number;
            /** @example Radarr Main */
            name: string;
            /** @example 127.0.0.1 */
            hostname: string;
            /** @example 7878 */
            port: number;
            /** @example exampleapikey */
            apiKey: string;
            /** @example false */
            useSsl: boolean;
            baseUrl?: string;
            /** @example 1 */
            activeProfileId: number;
            /** @example 720p/1080p */
            activeProfileName: string;
            /** @example /movies */
            activeDirectory: string;
            /** @example false */
            is4k: boolean;
            /** @example In Cinema */
            minimumAvailability: string;
            /** @example false */
            isDefault: boolean;
            /** @example http://radarr.example.com */
            externalUrl?: string;
            /** @example false */
            syncEnabled?: boolean;
            /** @example false */
            preventSearch?: boolean;
        };
        SonarrSettings: {
            /** @example 0 */
            readonly id?: number;
            /** @example Sonarr Main */
            name: string;
            /** @example 127.0.0.1 */
            hostname: string;
            /** @example 8989 */
            port: number;
            /** @example exampleapikey */
            apiKey: string;
            /** @example false */
            useSsl: boolean;
            baseUrl?: string;
            /** @example 1 */
            activeProfileId: number;
            /** @example 720p/1080p */
            activeProfileName: string;
            /** @example /tv/ */
            activeDirectory: string;
            /** @example 1 */
            activeLanguageProfileId?: number;
            activeAnimeProfileId?: number | null;
            activeAnimeLanguageProfileId?: number | null;
            /** @example 720p/1080p */
            activeAnimeProfileName?: string | null;
            activeAnimeDirectory?: string | null;
            /** @example false */
            is4k: boolean;
            /** @example false */
            enableSeasonFolders: boolean;
            /** @example false */
            isDefault: boolean;
            /** @example http://radarr.example.com */
            externalUrl?: string;
            /** @example false */
            syncEnabled?: boolean;
            /** @example false */
            preventSearch?: boolean;
        };
        ServarrTag: {
            /** @example 1 */
            id?: number;
            /** @example A Label */
            label?: string;
        };
        PublicSettings: {
            /** @example false */
            initialized: boolean;
            /**
             * Format: uuid
             * @description Instance Plex OAuth client identifier
             * @example 6919275e-142a-48d8-be6b-93594cbd4626
             */
            plexClientIdentifier: string;
        };
        MovieResult: {
            /** @example 1234 */
            id: number;
            mediaType: string;
            /** @example 10 */
            popularity?: number;
            posterPath?: string;
            backdropPath?: string;
            voteCount?: number;
            voteAverage?: number;
            genreIds?: number[];
            /** @example Overview of the movie */
            overview?: string;
            /** @example en */
            originalLanguage?: string;
            /** @example Movie Title */
            title: string;
            /** @example Original Movie Title */
            originalTitle?: string;
            releaseDate?: string;
            /** @example false */
            adult?: boolean;
            /** @example false */
            video?: boolean;
            mediaInfo?: components["schemas"]["MediaInfo"];
        };
        TvResult: {
            /** @example 1234 */
            id?: number;
            mediaType?: string;
            /** @example 10 */
            popularity?: number;
            posterPath?: string;
            backdropPath?: string;
            voteCount?: number;
            voteAverage?: number;
            genreIds?: number[];
            /** @example Overview of the movie */
            overview?: string;
            /** @example en */
            originalLanguage?: string;
            /** @example TV Show Name */
            name?: string;
            /** @example Original TV Show Name */
            originalName?: string;
            originCountry?: string[];
            firstAirDate?: string;
            mediaInfo?: components["schemas"]["MediaInfo"];
        };
        PersonResult: {
            /** @example 12345 */
            id?: number;
            profilePath?: string;
            /** @example false */
            adult?: boolean;
            /** @default person */
            mediaType: string;
            knownFor?: (components["schemas"]["MovieResult"] | components["schemas"]["TvResult"])[];
        };
        Genre: {
            /** @example 1 */
            id?: number;
            /** @example Adventure */
            name?: string;
        };
        Company: {
            /** @example 1 */
            id?: number;
            logo_path?: string | null;
            name?: string;
        };
        ProductionCompany: {
            /** @example 1 */
            id?: number;
            logoPath?: string | null;
            originCountry?: string;
            name?: string;
        };
        Network: {
            /** @example 1 */
            id?: number;
            logoPath?: string | null;
            originCountry?: string;
            name?: string;
        };
        RelatedVideo: {
            /** @example https://www.youtube.com/watch?v=9qhL2_UxXM0/ */
            url?: string;
            /** @example 9qhL2_UxXM0 */
            key?: string;
            /** @example Trailer for some movie (1978) */
            name?: string;
            /** @example 1080 */
            size?: number;
            /**
             * @example Trailer
             * @enum {string}
             */
            type?: "Clip" | "Teaser" | "Trailer" | "Featurette" | "Opening Credits" | "Behind the Scenes" | "Bloopers";
            /** @enum {string} */
            site?: "YouTube";
        };
        MovieDetails: {
            /** @example 123 */
            readonly id?: number;
            /** @example tt123 */
            imdbId?: string;
            adult?: boolean;
            backdropPath?: string;
            posterPath?: string;
            /** @example 1000000 */
            budget?: number;
            genres?: components["schemas"]["Genre"][];
            homepage?: string;
            relatedVideos?: components["schemas"]["RelatedVideo"][];
            originalLanguage?: string;
            originalTitle?: string;
            overview?: string;
            popularity?: number;
            productionCompanies?: components["schemas"]["ProductionCompany"][];
            productionCountries?: {
                iso_3166_1?: string;
                name?: string;
            }[];
            releaseDate?: string;
            releases?: {
                results?: {
                    /** @example US */
                    iso_3166_1?: string;
                    rating?: string | null;
                    release_dates?: {
                        /** @example PG-13 */
                        certification?: string;
                        iso_639_1?: string | null;
                        /** @example Blu ray */
                        note?: string | null;
                        /** @example 2017-07-12T00:00:00.000Z */
                        release_date?: string;
                        /** @example 1 */
                        type?: number;
                    }[];
                }[];
            };
            revenue?: number | null;
            runtime?: number;
            spokenLanguages?: components["schemas"]["SpokenLanguage"][];
            status?: string;
            tagline?: string;
            title?: string;
            video?: boolean;
            voteAverage?: number;
            voteCount?: number;
            credits?: {
                cast?: components["schemas"]["Cast"][];
                crew?: components["schemas"]["Crew"][];
            };
            collection?: {
                /** @example 1 */
                id?: number;
                /** @example A collection */
                name?: string;
                posterPath?: string;
                backdropPath?: string;
            };
            externalIds?: components["schemas"]["ExternalIds"];
            mediaInfo?: components["schemas"]["MediaInfo"];
            watchProviders?: components["schemas"]["WatchProviders"][];
        };
        Episode: {
            id?: number;
            name?: string;
            airDate?: string | null;
            episodeNumber?: number;
            overview?: string;
            productionCode?: string;
            seasonNumber?: number;
            showId?: number;
            stillPath?: string | null;
            voteAverage?: number;
            voteCount?: number;
        };
        Season: {
            id?: number;
            airDate?: string | null;
            episodeCount?: number;
            name?: string;
            overview?: string;
            posterPath?: string;
            seasonNumber?: number;
            episodes?: components["schemas"]["Episode"][];
        };
        TvDetails: {
            /** @example 123 */
            id?: number;
            backdropPath?: string;
            posterPath?: string;
            contentRatings?: {
                results?: {
                    /** @example US */
                    iso_3166_1?: string;
                    /** @example TV-14 */
                    rating?: string;
                }[];
            };
            createdBy?: {
                id?: number;
                name?: string;
                gender?: number;
                profilePath?: string | null;
            }[];
            episodeRunTime?: number[];
            firstAirDate?: string;
            genres?: components["schemas"]["Genre"][];
            homepage?: string;
            inProduction?: boolean;
            languages?: string[];
            lastAirDate?: string;
            lastEpisodeToAir?: components["schemas"]["Episode"];
            name?: string;
            nextEpisodeToAir?: components["schemas"]["Episode"];
            networks?: components["schemas"]["ProductionCompany"][];
            numberOfEpisodes?: number;
            numberOfSeason?: number;
            originCountry?: string[];
            originalLanguage?: string;
            originalName?: string;
            overview?: string;
            popularity?: number;
            productionCompanies?: components["schemas"]["ProductionCompany"][];
            productionCountries?: {
                iso_3166_1?: string;
                name?: string;
            }[];
            spokenLanguages?: components["schemas"]["SpokenLanguage"][];
            seasons?: components["schemas"]["Season"][];
            status?: string;
            tagline?: string;
            type?: string;
            voteAverage?: number;
            voteCount?: number;
            credits?: {
                cast?: components["schemas"]["Cast"][];
                crew?: components["schemas"]["Crew"][];
            };
            externalIds?: components["schemas"]["ExternalIds"];
            keywords?: components["schemas"]["Keyword"][];
            mediaInfo?: components["schemas"]["MediaInfo"];
            watchProviders?: components["schemas"]["WatchProviders"][];
        };
        MediaRequest: {
            /** @example 123 */
            readonly id: number;
            /**
             * @description Status of the request. 1 = PENDING APPROVAL, 2 = APPROVED, 3 = DECLINED
             * @example 0
             */
            readonly status: number;
            media?: components["schemas"]["MediaInfo"];
            /** @example 2020-09-12T10:00:27.000Z */
            readonly createdAt?: string;
            /** @example 2020-09-12T10:00:27.000Z */
            readonly updatedAt?: string;
            requestedBy?: components["schemas"]["User"];
            modifiedBy?: components["schemas"]["User"] | (string | null);
            /** @example false */
            is4k?: boolean;
            serverId?: number;
            profileId?: number;
            rootFolder?: string;
            /**
             * @description If true, this request will not count against the user's quota. Requires MANAGE_REQUESTS permission.
             * @example false
             */
            ignoreQuota?: boolean;
        };
        MediaInfo: {
            readonly id?: number;
            readonly tmdbId?: number;
            readonly tvdbId?: number | null;
            /**
             * @description Availability of the media. 1 = `UNKNOWN`, 2 = `PENDING`, 3 = `PROCESSING`, 4 = `PARTIALLY_AVAILABLE`, 5 = `AVAILABLE`, 6 = `DELETED`
             * @example 0
             */
            status?: number;
            readonly requests?: components["schemas"]["MediaRequest"][];
            /** @example 2020-09-12T10:00:27.000Z */
            readonly createdAt?: string;
            /** @example 2020-09-12T10:00:27.000Z */
            readonly updatedAt?: string;
        };
        Cast: {
            /** @example 123 */
            id?: number;
            /** @example 1 */
            castId?: number;
            /** @example Some Character Name */
            character?: string;
            creditId?: string;
            gender?: number;
            /** @example Some Persons Name */
            name?: string;
            order?: number;
            profilePath?: string | null;
        };
        Crew: {
            /** @example 123 */
            id?: number;
            creditId?: string;
            gender?: number;
            /** @example Some Persons Name */
            name?: string;
            job?: string;
            department?: string;
            profilePath?: string | null;
        };
        ExternalIds: {
            facebookId?: string | null;
            freebaseId?: string | null;
            freebaseMid?: string | null;
            imdbId?: string | null;
            instagramId?: string | null;
            tvdbId?: number | null;
            tvrageId?: number | null;
            twitterId?: string | null;
        };
        ServiceProfile: {
            /** @example 1 */
            id?: number;
            /** @example 720p/1080p */
            name?: string;
        };
        PageInfo: {
            /** @example 1 */
            page?: number;
            /** @example 10 */
            pages?: number;
            /** @example 100 */
            results?: number;
        };
        DiscordSettings: {
            /** @example false */
            enabled?: boolean;
            /** @example 2 */
            types?: number;
            options?: {
                botUsername?: string;
                botAvatarUrl?: string;
                webhookUrl?: string;
                webhookRoleId?: string;
                enableMentions?: boolean;
            };
        };
        SlackSettings: {
            /** @example false */
            enabled?: boolean;
            /** @example 2 */
            types?: number;
            options?: {
                webhookUrl?: string;
            };
        };
        WebPushSettings: {
            /** @example false */
            enabled?: boolean;
            /** @example 2 */
            types?: number;
        };
        WebhookSettings: {
            /** @example false */
            enabled?: boolean;
            /** @example 2 */
            types?: number;
            options?: {
                webhookUrl?: string;
                authHeader?: string;
                jsonPayload?: string;
                /** @example false */
                supportVariables?: boolean;
            };
        };
        TelegramSettings: {
            /** @example false */
            enabled?: boolean;
            /** @example 2 */
            types?: number;
            options?: {
                botUsername?: string;
                botAPI?: string;
                chatId?: string;
                messageThreadId?: string;
                sendSilently?: boolean;
            };
        };
        PushbulletSettings: {
            /** @example false */
            enabled?: boolean;
            /** @example 2 */
            types?: number;
            options?: {
                accessToken?: string;
                channelTag?: string | null;
            };
        };
        PushoverSettings: {
            /** @example false */
            enabled?: boolean;
            /** @example 2 */
            types?: number;
            options?: {
                accessToken?: string;
                userToken?: string;
                sound?: string;
            };
        };
        GotifySettings: {
            /** @example false */
            enabled?: boolean;
            /** @example 2 */
            types?: number;
            options?: {
                url?: string;
                token?: string;
            };
        };
        NtfySettings: {
            /** @example false */
            enabled?: boolean;
            /** @example 2 */
            types?: number;
            options?: {
                url?: string;
                topic?: string;
                authMethodUsernamePassword?: boolean;
                username?: string;
                password?: string;
                authMethodToken?: boolean;
                token?: string;
                priority?: number;
                locale?: string;
            };
        };
        NotificationEmailSettings: {
            /** @example false */
            enabled?: boolean;
            /** @example 2 */
            types?: number;
            options?: {
                /** @example no-reply@example.com */
                emailFrom?: string;
                /** @example Seerr */
                senderName?: string;
                /** @example 127.0.0.1 */
                smtpHost?: string;
                /** @example 465 */
                smtpPort?: number;
                /** @example false */
                secure?: boolean;
                /** @example false */
                ignoreTls?: boolean;
                /** @example false */
                requireTls?: boolean;
                authUser?: string | null;
                authPass?: string | null;
                /** @example false */
                allowSelfSigned?: boolean;
            };
        };
        Job: {
            /** @example job-name */
            id?: string;
            /** @enum {string} */
            type?: "process" | "command";
            /** @enum {string} */
            interval?: "short" | "long" | "fixed";
            /** @example A Job Name */
            name?: string;
            /** @example 2020-09-02T05:02:23.000Z */
            nextExecutionTime?: string;
            /** @example false */
            running?: boolean;
        };
        PersonDetails: {
            /** @example 1 */
            id?: number;
            name?: string;
            deathday?: string;
            knownForDepartment?: string;
            alsoKnownAs?: string[];
            gender?: string;
            biography?: string;
            popularity?: string;
            placeOfBirth?: string;
            profilePath?: string;
            adult?: boolean;
            imdbId?: string;
            homepage?: string;
        };
        CreditCast: {
            /** @example 1 */
            id?: number;
            originalLanguage?: string;
            episodeCount?: number;
            overview?: string;
            originCountry?: string[];
            originalName?: string;
            voteCount?: number;
            name?: string;
            mediaType?: string;
            popularity?: number;
            creditId?: string;
            backdropPath?: string;
            firstAirDate?: string;
            voteAverage?: number;
            genreIds?: number[];
            posterPath?: string;
            originalTitle?: string;
            video?: boolean;
            title?: string;
            adult?: boolean;
            releaseDate?: string;
            character?: string;
            mediaInfo?: components["schemas"]["MediaInfo"];
        };
        CreditCrew: {
            /** @example 1 */
            id?: number;
            originalLanguage?: string;
            episodeCount?: number;
            overview?: string;
            originCountry?: string[];
            originalName?: string;
            voteCount?: number;
            name?: string;
            mediaType?: string;
            popularity?: number;
            creditId?: string;
            backdropPath?: string;
            firstAirDate?: string;
            voteAverage?: number;
            genreIds?: number[];
            posterPath?: string;
            originalTitle?: string;
            video?: boolean;
            title?: string;
            adult?: boolean;
            releaseDate?: string;
            department?: string;
            job?: string;
            mediaInfo?: components["schemas"]["MediaInfo"];
        };
        Keyword: {
            /** @example 1 */
            id?: number;
            /** @example anime */
            name?: string;
        };
        SpokenLanguage: {
            /** @example English */
            englishName?: string | null;
            /** @example en */
            iso_639_1?: string;
            /** @example English */
            name?: string;
        };
        Collection: {
            /** @example 123 */
            id?: number;
            /** @example A Movie Collection */
            name?: string;
            /** @example Overview of collection */
            overview?: string;
            posterPath?: string;
            backdropPath?: string;
            parts?: components["schemas"]["MovieResult"][];
        };
        SonarrSeries: {
            /** @example COVID-25 */
            title?: string;
            /** @example covid 25 */
            sortTitle?: string;
            /** @example 1 */
            seasonCount?: number;
            /** @example upcoming */
            status?: string;
            /** @example The thread is picked up again by Marianne Schmidt which ... */
            overview?: string;
            /** @example CBS */
            network?: string;
            /** @example 02:15 */
            airTime?: string;
            images?: {
                /** @example banner */
                coverType?: string;
                /** @example /sonarr/MediaCoverProxy/6467f05d9872726ad08cbf920e5fee4bf69198682260acab8eab5d3c2c958e92/5c8f116c6aa5c.jpg */
                url?: string;
            }[];
            /** @example https://artworks.thetvdb.com/banners/posters/5c8f116129983.jpg */
            remotePoster?: string;
            seasons?: {
                /** @example 1 */
                seasonNumber?: number;
                /** @example true */
                monitored?: boolean;
            }[];
            /** @example 2015 */
            year?: number;
            path?: string;
            profileId?: number;
            languageProfileId?: number;
            seasonFolder?: boolean;
            monitored?: boolean;
            useSceneNumbering?: boolean;
            runtime?: number;
            /** @example 12345 */
            tvdbId?: number;
            tvRageId?: number;
            tvMazeId?: number;
            firstAired?: string;
            lastInfoSync?: string | null;
            seriesType?: string;
            cleanTitle?: string;
            imdbId?: string;
            titleSlug?: string;
            certification?: string;
            genres?: string[];
            tags?: string[];
            added?: string;
            ratings?: {
                votes?: number;
                value?: number;
            }[];
            qualityProfileId?: number;
            id?: number | null;
            rootFolderPath?: string | null;
            addOptions?: {
                ignoreEpisodesWithFiles?: boolean | null;
                ignoreEpisodesWithoutFiles?: boolean | null;
                searchForMissingEpisodes?: boolean | null;
            }[];
        };
        UserSettingsNotifications: {
            notificationTypes?: components["schemas"]["NotificationAgentTypes"];
            emailEnabled?: boolean;
            pgpKey?: string | null;
            discordEnabled?: boolean;
            discordEnabledTypes?: number | null;
            discordIds?: string[] | null;
            pushbulletAccessToken?: string | null;
            pushoverApplicationToken?: string | null;
            pushoverUserKey?: string | null;
            pushoverSound?: string | null;
            telegramEnabled?: boolean;
            telegramBotUsername?: string | null;
            telegramChatId?: string | null;
            telegramMessageThreadId?: string | null;
            telegramSendSilently?: boolean | null;
        };
        NotificationAgentTypes: {
            discord?: number;
            email?: number;
            pushbullet?: number;
            pushover?: number;
            slack?: number;
            telegram?: number;
            webhook?: number;
            webpush?: number;
        };
        WatchProviders: {
            iso_3166_1?: string;
            link?: string;
            buy?: components["schemas"]["WatchProviderDetails"][];
            flatrate?: unknown;
        }[];
        WatchProviderDetails: {
            displayPriority?: number;
            logoPath?: string;
            id?: number;
            name?: string;
        };
        Issue: {
            /** @example 1 */
            id?: number;
            /** @example 1 */
            issueType?: number;
            media?: components["schemas"]["MediaInfo"];
            createdBy?: components["schemas"]["User"];
            modifiedBy?: components["schemas"]["User"];
            comments?: components["schemas"]["IssueComment"][];
        };
        IssueComment: {
            /** @example 1 */
            id?: number;
            user?: components["schemas"]["User"];
            /** @example A comment */
            message?: string;
        };
        DiscoverSlider: {
            /** @example 1 */
            id?: number;
            /** @example 1 */
            type: number;
            title: string | null;
            isBuiltIn?: boolean;
            enabled: boolean;
            /** @example 1234 */
            data: string | null;
        };
        WatchProviderRegion: {
            iso_3166_1?: string;
            english_name?: string;
            native_name?: string;
        };
        OverrideRule: {
            id?: string;
        };
        Certification: {
            /** @example PG-13 */
            certification: string;
            /** @example Some material may be inappropriate for children under 13. */
            meaning?: string | null;
            /** @example 3 */
            order?: number | null;
        };
        /**
         * @example {
         *       "certifications": {
         *         "US": [
         *           {
         *             "certification": "G",
         *             "meaning": "All ages admitted",
         *             "order": 1
         *           },
         *           {
         *             "certification": "PG",
         *             "meaning": "Some material may not be suitable for children under 10.",
         *             "order": 2
         *           }
         *         ]
         *       }
         *     }
         */
        CertificationResponse: {
            certifications?: {
                [key: string]: components["schemas"]["Certification"][];
            };
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
