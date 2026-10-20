/** The title, and help where it needs one, of each event the plugin can send. */
export const EVENT_LABELS: Record<string, { title: string; help?: string }> = {
  itemAdded: { title: "home.settings.notifications.events.item_added" },
  seerrRequests: {
    title: "home.settings.notifications.events.seerr_requests",
    help: "home.settings.notifications.events.seerr_requests_help",
  },
  userLockedOut: {
    title: "home.settings.notifications.events.user_locked_out",
  },
  seerrPending: {
    title: "home.settings.notifications.events.seerr_pending",
    help: "home.settings.notifications.events.seerr_pending_help",
  },
  sessionStarted: {
    title: "home.settings.notifications.events.session_started",
  },
  playbackStarted: {
    title: "home.settings.notifications.events.playback_started",
  },
  signInFailed: { title: "home.settings.notifications.events.sign_in_failed" },
  taskFailed: { title: "home.settings.notifications.events.task_failed" },
  pluginChanged: {
    title: "home.settings.notifications.events.plugin_changed",
    help: "home.settings.notifications.events.plugin_changed_help",
  },
};
