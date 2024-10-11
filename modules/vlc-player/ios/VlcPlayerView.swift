import ExpoModulesCore
import UIKit
import MobileVLCKit

class VlcPlayerView: ExpoView, VLCMediaPlayerDelegate {
  private var mediaPlayer: VLCMediaPlayer?
  private var movieView: UIView?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    DispatchQueue.main.async {
      self.setupView()
      self.backgroundColor = UIColor.black // Set background color to black
    }
  }

  private func setupView() {
    DispatchQueue.main.async {
      self.movieView = UIView()
      self.movieView?.translatesAutoresizingMaskIntoConstraints = false

      if let movieView = self.movieView {
        self.addSubview(movieView)
        NSLayoutConstraint.activate([
          movieView.leadingAnchor.constraint(equalTo: self.leadingAnchor),
          movieView.trailingAnchor.constraint(equalTo: self.trailingAnchor),
          movieView.topAnchor.constraint(equalTo: self.topAnchor),
          movieView.bottomAnchor.constraint(equalTo: self.bottomAnchor)
        ])
      }

      self.setupMediaPlayer()
    }
  }

  private func setupMediaPlayer() {
    DispatchQueue.main.async {
      self.mediaPlayer = VLCMediaPlayer()
      self.mediaPlayer?.delegate = self
      self.mediaPlayer?.drawable = self.movieView
      print("Media player setup on main thread: \(Thread.isMainThread)")
    }
  }

  @objc func setSource(_ source: String) {
    DispatchQueue.main.async {
      print("Setting media source on main thread: \(Thread.isMainThread)")
      if let url = URL(string: source) {
        self.mediaPlayer?.media = VLCMedia(url: url)
        print("Media set, now playing...")
        self.mediaPlayer?.play()
      } else {
        print("Invalid URL.")
      }
    }
  }

  @objc func handlePlayPause() {
    DispatchQueue.main.async {
      print("Handling play/pause on main thread: \(Thread.isMainThread)")
      if self.mediaPlayer?.isPlaying == true {
        self.mediaPlayer?.pause()
      } else {
        self.mediaPlayer?.play()
      }
    }
  }

  func mediaPlayerStateChanged(_ aNotification: Notification!) {
    DispatchQueue.main.async {
      print("Media player state changed on main thread: \(Thread.isMainThread)")
      if self.mediaPlayer?.state == .stopped {
        print("Media player stopped")
      }
    }
  }
}