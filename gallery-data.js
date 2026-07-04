/* ============================================================================
   GALLERY DATA  —  this is the only file you edit to manage your photos.

   HOW TO ADD PHOTOS
   1. Drop your image files into the  images/  folder (e.g. images/iceland-01.jpg).
      JP/PNG/WEBP all work. Keep them reasonably sized (long edge ~1600px) so the
      page stays fast.
   2. Add an album below, or add photos to an existing album's `photos` list.

   ALBUM fields:   title (required) · name (a subtitle: place, year, etc.)
                   cover (image shown on the album card — usually one of its photos)
   PHOTO fields:   src (required) · title (short caption) · location

   The placeholder images (images/ph-*.svg) are just samples — replace them with
   your real photos and delete the ones you don't use.
   ========================================================================== */

const ALBUMS = [
  {
    title: "Photography",
    name: "Favorite frames",
    cover: "images/ph-1.svg",
    photos: [
      { src: "images/ph-1.svg", title: "Morning light",   location: "Atlanta, GA" },
      { src: "images/ph-2.svg", title: "Golden hour",     location: "Savannah, GA" },
      { src: "images/ph-3.svg", title: "Long exposure",   location: "Blue Ridge, GA" },
    ],
  },
  {
    title: "Travel",
    name: "On the road, 2025",
    cover: "images/ph-4.svg",
    photos: [
      { src: "images/ph-4.svg", title: "Coastline",       location: "Big Sur, CA" },
      { src: "images/ph-5.svg", title: "Old town",        location: "Kyoto, Japan" },
      { src: "images/ph-6.svg", title: "Highlands",       location: "Reykjavík, Iceland" },
    ],
  },
];
