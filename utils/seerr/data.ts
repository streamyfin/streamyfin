/**
 * The tables the Seerr web interface owns, copied rather than typed.
 *
 * These are not API shapes: they are the networks and studios its discover
 * rows offer, the colours it gives each genre, and two constants the app
 * reads alongside them. Nothing serves them over HTTP, so the spec cannot
 * describe them and the generator cannot reach them.
 *
 * Copied from seerr-team/seerr@v3.4.1, MIT:
 *   src/components/Discover/NetworkSlider/index.tsx
 *   src/components/Discover/StudioSlider/index.tsx
 *   src/components/Discover/constants.ts
 *   server/api/themoviedb/constants.ts
 *
 * The shape is the submodule's, not upstream's: an `id` and a bare image path
 * rather than a `url` and a full one, because that is what the app's own
 * components read and `COMPANY_LOGO_IMAGE_FILTER` is applied by the caller.
 *
 * The content is upstream's. Copying the submodule's rows verbatim carried its
 * staleness with them: it was missing A24, which upstream has had since before
 * v3.4.1. Checked row by row against the pinned version, and that is the one
 * difference there was.
 */

/** TMDB's keyword id for anime, which the app filters series on. */
export const ANIME_KEYWORD_ID = 210024;

export interface Network {
  name: string;
  image: string;
  id: number;
}

export const COMPANY_LOGO_IMAGE_FILTER = "w780_filter(duotone,ffffff,bababa)";

export const networks: Network[] = [
  {
    name: "Netflix",
    image: "/wwemzKWzjKYJFfCeiB57q3r4Bcm.png",
    id: 213,
  },
  {
    name: "Disney+",
    image: "/gJ8VX6JSu3ciXHuC2dDGAo2lvwM.png",
    id: 2739,
  },
  {
    name: "Prime Video",
    image: "/ifhbNuuVnlwYy5oXA5VIb2YR8AZ.png",
    id: 1024,
  },
  {
    name: "Apple TV+",
    image: "/4KAy34EHvRM25Ih8wb82AuGU7zJ.png",
    id: 2552,
  },
  {
    name: "Hulu",
    image: "/pqUTCleNUiTLAVlelGxUgWn1ELh.png",
    id: 453,
  },
  {
    name: "HBO",
    image: "/tuomPhY2UtuPTqqFnKMVHvSb724.png",
    id: 49,
  },
  {
    name: "Discovery+",
    image: "/1D1bS3Dyw4ScYnFWTlBOvJXC3nb.png",
    id: 4353,
  },
  {
    name: "ABC",
    image: "/ndAvF4JLsliGreX87jAc9GdjmJY.png",
    id: 2,
  },
  {
    name: "FOX",
    image: "/1DSpHrWyOORkL9N2QHX7Adt31mQ.png",
    id: 19,
  },
  {
    name: "Cinemax",
    image: "/6mSHSquNpfLgDdv6VnOOvC5Uz2h.png",
    id: 359,
  },
  {
    name: "AMC",
    image: "/pmvRmATOCaDykE6JrVoeYxlFHw3.png",
    id: 174,
  },
  {
    name: "Showtime",
    image: "/Allse9kbjiP6ExaQrnSpIhkurEi.png",
    id: 67,
  },
  {
    name: "Starz",
    image: "/8GJjw3HHsAJYwIWKIPBPfqMxlEa.png",
    id: 318,
  },
  {
    name: "The CW",
    image: "/ge9hzeaU7nMtQ4PjkFlc68dGAJ9.png",
    id: 71,
  },
  {
    name: "NBC",
    image: "/o3OedEP0f9mfZr33jz2BfXOUK5.png",
    id: 6,
  },
  {
    name: "CBS",
    image: "/nm8d7P7MJNiBLdgIzUK0gkuEA4r.png",
    id: 16,
  },
  {
    name: "Paramount+",
    image: "/fi83B1oztoS47xxcemFdPMhIzK.png",
    id: 4330,
  },
  {
    name: "BBC One",
    image: "/mVn7xESaTNmjBUyUtGNvDQd3CT1.png",
    id: 4,
  },
  {
    name: "Cartoon Network",
    image: "/c5OC6oVCg6QP4eqzW6XIq17CQjI.png",
    id: 56,
  },
  {
    name: "Adult Swim",
    image: "/9AKyspxVzywuaMuZ1Bvilu8sXly.png",
    id: 80,
  },
  {
    name: "Nickelodeon",
    image: "/ikZXxg6GnwpzqiZbRPhJGaZapqB.png",
    id: 13,
  },
  {
    name: "Peacock",
    image: "/gIAcGTjKKr0KOHL5s4O36roJ8p7.png",
    id: 3353,
  },
];
export interface Studio {
  name: string;
  image: string;
  id: number;
}

export const studios: Studio[] = [
  {
    name: "Disney",
    image: "/wdrCwmRnLFJhEoH8GSfymY85KHT.png",
    id: 2,
  },
  {
    name: "20th Century Studios",
    image: "/h0rjX5vjW5r8yEnUBStFarjcLT4.png",
    id: 127928,
  },
  {
    name: "Sony Pictures",
    image: "/GagSvqWlyPdkFHMfQ3pNq6ix9P.png",
    id: 34,
  },
  {
    name: "Warner Bros. Pictures",
    image: "/ky0xOc5OrhzkZ1N6KyUxacfQsCk.png",
    id: 174,
  },
  {
    name: "Universal",
    image: "/8lvHyhjr8oUKOOy2dKXoALWKdp0.png",
    id: 33,
  },
  {
    name: "Paramount",
    image: "/fycMZt242LVjagMByZOLUGbCvv3.png",
    id: 4,
  },
  {
    name: "Pixar",
    image: "/1TjvGVDMYsj6JBxOAkUHpPEwLf7.png",
    id: 3,
  },
  {
    name: "Dreamworks",
    image: "/kP7t6RwGz2AvvTkvnI1uteEwHet.png",
    id: 521,
  },
  {
    name: "Marvel Studios",
    image: "/hUzeosd33nzE5MCNsZxCGEKTXaQ.png",
    id: 420,
  },
  {
    name: "DC",
    image: "/2Tc1P3Ac8M479naPp1kYT3izLS5.png",
    id: 9993,
  },
  {
    name: "A24",
    image: "/1ZXsGaFPgrgS6ZZGS37AqD5uU12.png",
    id: 41077,
  },
];

type AvailableColors =
  | "black"
  | "red"
  | "darkred"
  | "blue"
  | "lightblue"
  | "darkblue"
  | "orange"
  | "darkorange"
  | "green"
  | "lightgreen"
  | "purple"
  | "darkpurple"
  | "yellow"
  | "pink";

export const colorTones: Record<AvailableColors, [string, string]> = {
  red: ["991B1B", "FCA5A5"],
  darkred: ["1F2937", "F87171"],
  blue: ["032541", "01b4e4"],
  lightblue: ["1F2937", "60A5FA"],
  darkblue: ["1F2937", "2864d2"],
  orange: ["92400E", "FCD34D"],
  lightgreen: ["065F46", "6EE7B7"],
  green: ["087d29", "21cb51"],
  purple: ["5B21B6", "C4B5FD"],
  yellow: ["777e0d", "e4ed55"],
  darkorange: ["552c01", "d47c1d"],
  black: ["1F2937", "D1D5DB"],
  pink: ["9D174D", "F9A8D4"],
  darkpurple: ["480c8b", "a96bef"],
};

export const genreColorMap: Record<number, [string, string]> = {
  0: colorTones.black,
  28: colorTones.red, // Action
  12: colorTones.darkpurple, // Adventure
  16: colorTones.blue, // Animation
  35: colorTones.orange, // Comedy
  80: colorTones.darkblue, // Crime
  99: colorTones.lightgreen, // Documentary
  18: colorTones.pink, // Drama
  10751: colorTones.yellow, // Family
  14: colorTones.lightblue, // Fantasy
  36: colorTones.orange, // History
  27: colorTones.black, // Horror
  10402: colorTones.blue, // Music
  9648: colorTones.purple, // Mystery
  10749: colorTones.pink, // Romance
  878: colorTones.lightblue, // Science Fiction
  10770: colorTones.red, // TV Movie
  53: colorTones.black, // Thriller
  10752: colorTones.darkred, // War
  37: colorTones.orange, // Western
  10759: colorTones.darkpurple, // Action & Adventure
  10762: colorTones.blue, // Kids
  10763: colorTones.black, // News
  10764: colorTones.darkorange, // Reality
  10765: colorTones.lightblue, // Sci-Fi & Fantasy
  10766: colorTones.pink, // Soap
  10767: colorTones.lightgreen, // Talk
  10768: colorTones.darkred, // War & Politics
};
