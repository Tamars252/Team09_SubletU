/**
 * Seeds the database with hosts and sublet listings at real addresses in the
 * Syracuse University neighborhood (University Hill, Westcott, Outer Comstock).
 *
 * Every address is geocoded against OpenStreetMap at seed time, so the pins on
 * the map are the buildings' actual coordinates. `fallback` is only used when
 * Nominatim is unreachable or has no match, which keeps `npm run seed` usable
 * offline.
 *
 * Run:  npm run seed            (skips if listings already exist)
 *       npm run seed -- --force (wipes seeded data and re-seeds)
 */
import { db, nowIso, transaction } from "./db.ts";
import { ListingData } from "./domain/ListingData.ts";
import { PhotoData } from "./domain/PhotoData.ts";
import { PricingData } from "./domain/PricingData.ts";
import { RoomDetails } from "./domain/RoomDetails.ts";
import { ScreenSettings } from "./domain/ScreenSettings.ts";
import { hashPassword, newId } from "./lib/crypto.ts";
import { geocodeAddress } from "./lib/geocode.ts";

type SeedHost = {
  key: string;
  email: string;
  name: string;
  university: string;
  bio: string;
  verified: boolean;
  rating: number;
  reviewCount: number;
};

type SeedListing = {
  host: string;
  title: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  fallback: { lat: number; lng: number };
  description: string;
  monthlyRent: number;
  availableFrom: string;
  availableTo: string;
  utilitiesIncluded: boolean;
  deposit: number;
  bedrooms: number;
  bathrooms: number;
  maxRoommates: number;
  petsAllowed: boolean;
  furnished: boolean;
  privateBath: boolean;
  amenities: string[];
  photos: string[];
};

const PASSWORD = "sublet123";

/* --------------------------------------------------------------- photo sets */

const P = {
  livingRoom: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80",
  bedroom: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200&q=80",
  kitchen: "https://images.unsplash.com/photo-1556909212-d5b604d0c90d?w=1200&q=80",
  house: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&q=80",
  studio: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80",
  brick: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200&q=80",
  loft: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80",
  bath: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=1200&q=80",
  desk: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&q=80",
  porch: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=80",
  modern: "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=1200&q=80",
  dining: "https://images.unsplash.com/photo-1600121848594-d8644e57abab?w=1200&q=80",
};

/* ---------------------------------------------------------------- the hosts */

const HOSTS: SeedHost[] = [
  {
    key: "aisha",
    email: "amansour@syr.edu",
    name: "Aisha Mansour",
    university: "Syracuse University",
    bio: "Junior studying Architecture. I keep a clean, quiet space and I'm looking for a respectful subletter for the summer.",
    verified: true,
    rating: 4.8,
    reviewCount: 12,
  },
  {
    key: "devon",
    email: "dcarter@syr.edu",
    name: "Devon Carter",
    university: "Syracuse University",
    bio: "Newhouse senior, graduating in May. Everything in the apartment stays — furniture, kitchen stuff, the whole setup.",
    verified: true,
    rating: 4.9,
    reviewCount: 21,
  },
  {
    key: "priya",
    email: "pnair@syr.edu",
    name: "Priya Nair",
    university: "Syracuse University",
    bio: "Grad student in the iSchool. I sublet my place every summer while I'm doing fieldwork — easy handoff, I've done this three times.",
    verified: true,
    rating: 5.0,
    reviewCount: 9,
  },
  {
    key: "marcus",
    email: "mokafor@syr.edu",
    name: "Marcus Okafor",
    university: "Syracuse University",
    bio: "Whitman '27. Big house with a porch on Ackerman — great if you want roommates around for the summer.",
    verified: true,
    rating: 4.6,
    reviewCount: 7,
  },
  {
    key: "hannah",
    email: "hlindqvist@syr.edu",
    name: "Hannah Lindqvist",
    university: "Syracuse University",
    bio: "ESF student, off to a field station for the summer. Cat-friendly place, and I'd love someone who likes plants.",
    verified: true,
    rating: 4.7,
    reviewCount: 15,
  },
  {
    key: "tyler",
    email: "tbrennan@syr.edu",
    name: "Tyler Brennan",
    university: "Syracuse University",
    bio: "Engineering junior with a summer co-op in Boston. Room is right on the Connective Corridor bus route.",
    verified: true,
    rating: 4.4,
    reviewCount: 5,
  },
  {
    key: "sofia",
    email: "sreyes@syr.edu",
    name: "Sofia Reyes",
    university: "Syracuse University",
    bio: "VPA painting major. My studio apartment gets incredible afternoon light — perfect if you need a quiet place to work.",
    verified: true,
    rating: 4.9,
    reviewCount: 18,
  },
  {
    key: "jordan",
    email: "jkim@syr.edu",
    name: "Jordan Kim",
    university: "Syracuse University",
    bio: "Law student. Managing the sublet for our 4-person house near Thornden Park while everyone scatters for the summer.",
    verified: true,
    rating: 4.5,
    reviewCount: 11,
  },
];

/* ------------------------------------------------------------- the listings */

const LISTINGS: SeedListing[] = [
  {
    host: "aisha",
    title: "Furnished 2BR at Copper Beech Commons",
    address: "300 University Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.0481, lng: -76.1343 },
    description:
      "All-inclusive furnished 2BR two blocks from the Quad. Rent covers heat, electric, water, cable and internet. Building has 24-hour security, a fitness center, and a shuttle that loops campus every 15 minutes. Both bedrooms lock, and the second bath means you're never waiting.",
    monthlyRent: 950,
    availableFrom: "2026-05-15",
    availableTo: "2026-08-15",
    utilitiesIncluded: true,
    deposit: 500,
    bedrooms: 2,
    bathrooms: 2,
    maxRoommates: 1,
    petsAllowed: true,
    furnished: true,
    privateBath: true,
    amenities: [
      "WiFi",
      "Furnished",
      "Laundry In-Unit",
      "Heating",
      "AC",
      "Parking",
      "Gym Access",
      "Pet Friendly",
      "Security System",
      "Utilities Included",
    ],
    photos: [P.livingRoom, P.bedroom, P.kitchen, P.bath],
  },
  {
    host: "devon",
    title: "Modern 2BR with skyline views — Theory Syracuse",
    address: "919 E Genesee St",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.0471, lng: -76.1368 },
    description:
      "Corner unit on a high floor with floor-to-ceiling windows facing downtown. Quartz counters, in-unit washer/dryer, keyless entry. Building amenities include a rooftop hot tub, a golf simulator, and a study lounge that stays open all night during finals. Garage parking available for an extra fee.",
    monthlyRent: 1240,
    availableFrom: "2026-05-20",
    availableTo: "2026-08-10",
    utilitiesIncluded: false,
    deposit: 750,
    bedrooms: 2,
    bathrooms: 2,
    maxRoommates: 1,
    petsAllowed: false,
    furnished: true,
    privateBath: true,
    amenities: [
      "WiFi",
      "AC",
      "Gym Access",
      "Pool",
      "Furnished",
      "Elevator",
      "Laundry In-Unit",
      "Dishwasher",
      "Parking",
      "Doorman",
    ],
    photos: [P.modern, P.loft, P.kitchen, P.bedroom, P.bath],
  },
  {
    host: "sofia",
    title: "Sunlit studio steps from Marshall Street",
    address: "750 S Crouse Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.0448, lng: -76.1364 },
    description:
      "Top-floor studio with west-facing windows and afternoon light for days. Everything you need is walkable — Marshall Street is at the end of the block, and it's a five-minute walk to Bird Library. Small but genuinely well laid out: a real kitchen, a proper closet, and a desk nook by the window.",
    monthlyRent: 820,
    availableFrom: "2026-05-10",
    availableTo: "2026-08-20",
    utilitiesIncluded: true,
    deposit: 400,
    bedrooms: 0,
    bathrooms: 1,
    maxRoommates: 0,
    petsAllowed: false,
    furnished: true,
    privateBath: true,
    amenities: ["WiFi", "Furnished", "Heating", "Laundry On-Site", "Utilities Included", "Bus Route"],
    photos: [P.studio, P.desk, P.kitchen],
  },
  {
    host: "marcus",
    title: "5BR house with a wraparound porch on Ackerman",
    address: "910 Ackerman Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.045, lng: -76.1287 },
    description:
      "Classic Syracuse student house — big porch, hardwood floors, and a kitchen that fits everyone. Renting all five bedrooms together or individually. Two full baths upstairs, laundry in the basement, and off-street parking for four cars. Westcott coffee shops are a ten-minute walk.",
    monthlyRent: 575,
    availableFrom: "2026-05-18",
    availableTo: "2026-08-18",
    utilitiesIncluded: false,
    deposit: 575,
    bedrooms: 5,
    bathrooms: 2,
    maxRoommates: 4,
    petsAllowed: true,
    furnished: true,
    privateBath: false,
    amenities: [
      "WiFi",
      "Furnished",
      "Laundry On-Site",
      "Parking",
      "Porch",
      "Backyard",
      "Pet Friendly",
      "Heating",
      "Storage",
    ],
    photos: [P.house, P.porch, P.dining, P.bedroom, P.kitchen],
  },
  {
    host: "hannah",
    title: "Cat-friendly 2BR in the Westcott Nation",
    address: "508 Westcott St",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.047, lng: -76.123 },
    description:
      "Second floor of a converted Victorian right in the middle of Westcott. Bay windows, original woodwork, and a landlord who actually answers the phone. Steps from Recess Coffee and the Westcott Theater. My cat stays with a friend for the summer, so pets are genuinely fine here.",
    monthlyRent: 700,
    availableFrom: "2026-05-25",
    availableTo: "2026-08-25",
    utilitiesIncluded: false,
    deposit: 350,
    bedrooms: 2,
    bathrooms: 1,
    maxRoommates: 1,
    petsAllowed: true,
    furnished: true,
    privateBath: false,
    amenities: [
      "WiFi",
      "Furnished",
      "Pet Friendly",
      "Heating",
      "Porch",
      "Laundry On-Site",
      "Bus Route",
      "Backyard",
    ],
    photos: [P.brick, P.livingRoom, P.bedroom, P.kitchen],
  },
  {
    host: "priya",
    title: "Quiet 1BR on Comstock — walk to the iSchool",
    address: "727 Comstock Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.04, lng: -76.1305 },
    description:
      "One-bedroom in a small, well-kept building on Comstock. Grad-student quiet — no undergrad party house next door. Six-minute walk to Hinds Hall and right on the Centro bus line for South Campus. Comes with a desk, a full bookshelf you're welcome to raid, and a window AC unit.",
    monthlyRent: 890,
    availableFrom: "2026-05-12",
    availableTo: "2026-08-12",
    utilitiesIncluded: true,
    deposit: 500,
    bedrooms: 1,
    bathrooms: 1,
    maxRoommates: 0,
    petsAllowed: false,
    furnished: true,
    privateBath: true,
    amenities: [
      "WiFi",
      "Furnished",
      "AC",
      "Heating",
      "Laundry On-Site",
      "Utilities Included",
      "Bus Route",
      "Storage",
    ],
    photos: [P.desk, P.bedroom, P.kitchen],
  },
  {
    host: "jordan",
    title: "4BR near Thornden Park — whole house",
    address: "220 Clarendon St",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.0418, lng: -76.1258 },
    description:
      "Whole house available, one block from Thornden Park and the pool. Four bedrooms, two baths, a dishwasher that works, and central air — rare for this block. Fenced backyard with a grill. Best fit for a group of four who want to keep the same setup all summer.",
    monthlyRent: 620,
    availableFrom: "2026-05-16",
    availableTo: "2026-08-16",
    utilitiesIncluded: false,
    deposit: 620,
    bedrooms: 4,
    bathrooms: 2,
    maxRoommates: 3,
    petsAllowed: true,
    furnished: true,
    privateBath: false,
    amenities: [
      "WiFi",
      "Furnished",
      "AC",
      "Dishwasher",
      "Laundry In-Unit",
      "Parking",
      "Backyard",
      "Porch",
      "Pet Friendly",
    ],
    photos: [P.house, P.dining, P.livingRoom, P.bedroom],
  },
  {
    host: "tyler",
    title: "Private room in 3BR on Ostrom Ave",
    address: "741 Ostrom Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.0447, lng: -76.131 },
    description:
      "One room in a three-bedroom, and the other two roommates are staying for the summer — they're both engineering students, pretty low-key. Room comes furnished with a full bed, desk, and dresser. Shared kitchen and bath. Right on the bus route and a seven-minute walk to Link Hall.",
    monthlyRent: 545,
    availableFrom: "2026-05-22",
    availableTo: "2026-08-14",
    utilitiesIncluded: true,
    deposit: 300,
    bedrooms: 1,
    bathrooms: 1,
    maxRoommates: 2,
    petsAllowed: false,
    furnished: true,
    privateBath: false,
    amenities: [
      "WiFi",
      "Furnished",
      "Heating",
      "Laundry On-Site",
      "Utilities Included",
      "Bus Route",
      "Parking",
    ],
    photos: [P.bedroom, P.livingRoom, P.kitchen],
  },
  {
    host: "devon",
    title: "The Marshall — 4BR/4BA suite, each room locks",
    address: "720 University Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.0464, lng: -76.1351 },
    description:
      "Four-bedroom suite where every bedroom has its own full bath and a keyed lock — the easiest setup if you're subletting with people you don't know yet. Building has a two-story gym, a golf simulator, tanning, and a shuttle. Directly across from the Life Sciences Complex.",
    monthlyRent: 1050,
    availableFrom: "2026-05-15",
    availableTo: "2026-08-15",
    utilitiesIncluded: true,
    deposit: 600,
    bedrooms: 4,
    bathrooms: 4,
    maxRoommates: 3,
    petsAllowed: false,
    furnished: true,
    privateBath: true,
    amenities: [
      "WiFi",
      "Furnished",
      "AC",
      "Gym Access",
      "Elevator",
      "Laundry In-Unit",
      "Dishwasher",
      "Security System",
      "Utilities Included",
      "Doorman",
    ],
    photos: [P.modern, P.bedroom, P.bath, P.kitchen, P.loft],
  },
  {
    host: "aisha",
    title: "3BR on Euclid with a huge front porch",
    address: "300 Euclid Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.048, lng: -76.13 },
    description:
      "Upstairs unit of a big Euclid house. Three bedrooms, one and a half baths, and a front porch that gets used constantly. Hardwood throughout, laundry in the unit, and parking for two. Euclid is the heart of the student neighborhood — you'll know everyone on the block by June.",
    monthlyRent: 660,
    availableFrom: "2026-05-19",
    availableTo: "2026-08-19",
    utilitiesIncluded: false,
    deposit: 400,
    bedrooms: 3,
    bathrooms: 1.5,
    maxRoommates: 2,
    petsAllowed: true,
    furnished: true,
    privateBath: false,
    amenities: [
      "WiFi",
      "Furnished",
      "Laundry In-Unit",
      "Parking",
      "Porch",
      "Heating",
      "Pet Friendly",
      "Storage",
    ],
    photos: [P.porch, P.livingRoom, P.bedroom, P.dining],
  },
  {
    host: "priya",
    title: "1BR loft at 111 Harrison — downtown adjacent",
    address: "111 Harrison St",
    city: "Syracuse",
    state: "NY",
    zip: "13202",
    fallback: { lat: 43.0435, lng: -76.1425 },
    description:
      "Exposed-brick loft between campus and downtown. Twelve-foot ceilings, big industrial windows, and a secure lobby. Walkable to Armory Square for food, and the free Connective Corridor bus stops out front and drops you at the Quad. Best option if you want to be near the hospitals or downtown internships.",
    monthlyRent: 1150,
    availableFrom: "2026-06-01",
    availableTo: "2026-08-31",
    utilitiesIncluded: false,
    deposit: 800,
    bedrooms: 1,
    bathrooms: 1,
    maxRoommates: 0,
    petsAllowed: true,
    furnished: false,
    privateBath: true,
    amenities: [
      "WiFi",
      "AC",
      "Elevator",
      "Laundry In-Unit",
      "Dishwasher",
      "Security System",
      "Pet Friendly",
      "Bus Route",
      "Storage",
    ],
    photos: [P.loft, P.modern, P.kitchen, P.bath],
  },
  {
    host: "marcus",
    title: "4BR on Ackerman — porch, parking, laundry",
    address: "869 Ackerman Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.0446, lng: -76.1292 },
    description:
      "Four bedrooms across two floors, all furnished. Newer kitchen with a dishwasher, updated bath, and a washer/dryer that isn't in a scary basement. Big porch, driveway for three, and a backyard. Ten minutes on foot to the Carrier Dome, five to the Westcott bus stop.",
    monthlyRent: 595,
    availableFrom: "2026-05-17",
    availableTo: "2026-08-17",
    utilitiesIncluded: false,
    deposit: 595,
    bedrooms: 4,
    bathrooms: 2,
    maxRoommates: 3,
    petsAllowed: true,
    furnished: true,
    privateBath: false,
    amenities: [
      "WiFi",
      "Furnished",
      "Laundry In-Unit",
      "Dishwasher",
      "Parking",
      "Porch",
      "Backyard",
      "Pet Friendly",
      "Heating",
    ],
    photos: [P.house, P.kitchen, P.bedroom, P.porch],
  },
  {
    host: "hannah",
    title: "Bright 3BR on Lancaster near Thornden",
    address: "1004 Lancaster Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.0468, lng: -76.1258 },
    description:
      "Quiet block, lots of trees, and a short walk to both Westcott and Thornden Park. Three bedrooms, a sunroom that makes a perfect study, and a landlord who lives two houses down and fixes things the same day. Plants stay — I'll leave watering instructions.",
    monthlyRent: 640,
    availableFrom: "2026-05-24",
    availableTo: "2026-08-22",
    utilitiesIncluded: false,
    deposit: 400,
    bedrooms: 3,
    bathrooms: 1,
    maxRoommates: 2,
    petsAllowed: true,
    furnished: true,
    privateBath: false,
    amenities: [
      "WiFi",
      "Furnished",
      "Heating",
      "Laundry On-Site",
      "Porch",
      "Backyard",
      "Pet Friendly",
      "Bus Route",
    ],
    photos: [P.brick, P.desk, P.livingRoom, P.bedroom],
  },
  {
    host: "sofia",
    title: "Artist's 2BR on Maryland Ave",
    address: "121 Maryland Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.0405, lng: -76.1372 },
    description:
      "Two-bedroom where the second room is set up as a studio — big table, good lamps, north light. Close to Comstock Art Facility and the hospitals. Utilities are included, which makes summer AC a non-issue. Ideal for a VPA or Newhouse student who needs work space.",
    monthlyRent: 780,
    availableFrom: "2026-05-11",
    availableTo: "2026-08-21",
    utilitiesIncluded: true,
    deposit: 450,
    bedrooms: 2,
    bathrooms: 1,
    maxRoommates: 1,
    petsAllowed: false,
    furnished: true,
    privateBath: false,
    amenities: [
      "WiFi",
      "Furnished",
      "AC",
      "Heating",
      "Laundry On-Site",
      "Utilities Included",
      "Storage",
      "Bus Route",
    ],
    photos: [P.desk, P.studio, P.livingRoom, P.kitchen],
  },
  {
    host: "jordan",
    title: "6BR on Comstock — big group sublet",
    address: "205 Comstock Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.0378, lng: -76.131 },
    description:
      "Six bedrooms, three baths, two kitchens — the whole house. Set up for a big group that wants to stay together over the summer. Two living rooms means you're not fighting over the TV. Walk to the law school and the Life Sciences Complex. Parking for five.",
    monthlyRent: 510,
    availableFrom: "2026-05-15",
    availableTo: "2026-08-15",
    utilitiesIncluded: false,
    deposit: 510,
    bedrooms: 6,
    bathrooms: 3,
    maxRoommates: 5,
    petsAllowed: false,
    furnished: true,
    privateBath: false,
    amenities: [
      "WiFi",
      "Furnished",
      "Laundry On-Site",
      "Parking",
      "Porch",
      "Heating",
      "Dishwasher",
      "Storage",
      "Backyard",
    ],
    photos: [P.house, P.dining, P.kitchen, P.livingRoom, P.bedroom],
  },
  {
    host: "tyler",
    title: "2BR on Walnut Ave — closest to the Quad",
    address: "621 Walnut Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.0424, lng: -76.1329 },
    description:
      "Genuinely the shortest walk to campus on this list — three minutes to the Quad, past Walnut Park. Two bedrooms, renovated bath, and a small deck off the kitchen. No parking, but at this distance you won't miss it. Heat and water included.",
    monthlyRent: 875,
    availableFrom: "2026-05-20",
    availableTo: "2026-08-08",
    utilitiesIncluded: true,
    deposit: 500,
    bedrooms: 2,
    bathrooms: 1,
    maxRoommates: 1,
    petsAllowed: false,
    furnished: true,
    privateBath: false,
    amenities: [
      "WiFi",
      "Furnished",
      "Heating",
      "AC",
      "Laundry On-Site",
      "Utilities Included",
      "Balcony",
    ],
    photos: [P.livingRoom, P.bedroom, P.bath],
  },
  {
    host: "aisha",
    title: "Renovated 3BR on Stratford St",
    address: "415 Stratford St",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.051, lng: -76.1265 },
    description:
      "Fully renovated last summer — new kitchen, new bath, new windows, central air. Three bedrooms on a quiet residential street just north of Westcott. Fifteen-minute walk to campus or one stop on the bus. Off-street parking for two and a real basement for storing bikes.",
    monthlyRent: 700,
    availableFrom: "2026-06-01",
    availableTo: "2026-08-28",
    utilitiesIncluded: false,
    deposit: 450,
    bedrooms: 3,
    bathrooms: 1.5,
    maxRoommates: 2,
    petsAllowed: true,
    furnished: false,
    privateBath: false,
    amenities: [
      "WiFi",
      "AC",
      "Heating",
      "Dishwasher",
      "Laundry In-Unit",
      "Parking",
      "Storage",
      "Pet Friendly",
      "Bus Route",
    ],
    photos: [P.kitchen, P.brick, P.bedroom, P.bath],
  },
  {
    host: "priya",
    title: "Private room + bath on Redfield Place",
    address: "137 Redfield Pl",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.0398, lng: -76.1268 },
    description:
      "One bedroom with its own attached bath in a shared house on Redfield — the quiet street behind Comstock. Two other rooms are occupied by grad students. Shared kitchen is big and actually clean. Utilities and internet included, month-to-month is negotiable.",
    monthlyRent: 615,
    availableFrom: "2026-05-15",
    availableTo: "2026-08-30",
    utilitiesIncluded: true,
    deposit: 300,
    bedrooms: 1,
    bathrooms: 1,
    maxRoommates: 2,
    petsAllowed: false,
    furnished: true,
    privateBath: true,
    amenities: [
      "WiFi",
      "Furnished",
      "Heating",
      "AC",
      "Laundry On-Site",
      "Utilities Included",
      "Parking",
      "Porch",
    ],
    photos: [P.bedroom, P.bath, P.kitchen],
  },
  {
    host: "hannah",
    title: "4BR on Dell St with a screened porch",
    address: "316 Dell St",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.0464, lng: -76.1247 },
    description:
      "Four bedrooms in a well-kept house off Westcott, with a screened porch that's the best place in the neighborhood on a July evening. Washer/dryer, dishwasher, and a garage you can use for bikes. Two blocks to the Westcott Street shops.",
    monthlyRent: 585,
    availableFrom: "2026-05-23",
    availableTo: "2026-08-23",
    utilitiesIncluded: false,
    deposit: 400,
    bedrooms: 4,
    bathrooms: 2,
    maxRoommates: 3,
    petsAllowed: true,
    furnished: true,
    privateBath: false,
    amenities: [
      "WiFi",
      "Furnished",
      "Laundry In-Unit",
      "Dishwasher",
      "Porch",
      "Backyard",
      "Parking",
      "Pet Friendly",
      "Storage",
    ],
    photos: [P.porch, P.house, P.dining, P.bedroom],
  },
  {
    host: "marcus",
    title: "5BR on Sumner Ave near South Campus buses",
    address: "812 Sumner Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.0389, lng: -76.1285 },
    description:
      "Five-bedroom house on Sumner, one block from the South Campus bus loop. Two full baths, a big kitchen, and a driveway that actually fits four cars. Cheapest per-room option on the list if you're filling it with a group. Landlord covers lawn and trash.",
    monthlyRent: 495,
    availableFrom: "2026-05-16",
    availableTo: "2026-08-16",
    utilitiesIncluded: false,
    deposit: 495,
    bedrooms: 5,
    bathrooms: 2,
    maxRoommates: 4,
    petsAllowed: true,
    furnished: true,
    privateBath: false,
    amenities: [
      "WiFi",
      "Furnished",
      "Laundry On-Site",
      "Parking",
      "Porch",
      "Backyard",
      "Heating",
      "Bus Route",
      "Pet Friendly",
    ],
    photos: [P.house, P.livingRoom, P.kitchen, P.bedroom],
  },
  {
    host: "devon",
    title: "2BR on Roosevelt Ave — quiet and close",
    address: "200 Roosevelt Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.049, lng: -76.1272 },
    description:
      "Ground-floor two-bedroom on a tree-lined block between Westcott and Thornden. Newly refinished floors, good water pressure, and a small yard. Not a party block — mostly grad students and young families. Twelve-minute walk to campus, or the 44 bus from the corner.",
    monthlyRent: 745,
    availableFrom: "2026-05-26",
    availableTo: "2026-08-26",
    utilitiesIncluded: false,
    deposit: 450,
    bedrooms: 2,
    bathrooms: 1,
    maxRoommates: 1,
    petsAllowed: true,
    furnished: true,
    privateBath: false,
    amenities: [
      "WiFi",
      "Furnished",
      "Heating",
      "Laundry On-Site",
      "Backyard",
      "Bus Route",
      "Pet Friendly",
      "Storage",
    ],
    photos: [P.brick, P.bedroom, P.livingRoom],
  },
  {
    host: "sofia",
    title: "Studio on Beech St — cheapest solo option",
    address: "425 Beech St",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.0455, lng: -76.1245 },
    description:
      "Small furnished studio in a converted house on Beech. Everything included — heat, electric, water, internet. If you want your own place for the summer without a roommate and without paying downtown loft prices, this is the one. Laundry in the basement, shared with three other units.",
    monthlyRent: 675,
    availableFrom: "2026-05-14",
    availableTo: "2026-08-29",
    utilitiesIncluded: true,
    deposit: 350,
    bedrooms: 0,
    bathrooms: 1,
    maxRoommates: 0,
    petsAllowed: false,
    furnished: true,
    privateBath: true,
    amenities: [
      "WiFi",
      "Furnished",
      "Heating",
      "Laundry On-Site",
      "Utilities Included",
      "Bus Route",
    ],
    photos: [P.studio, P.bedroom, P.kitchen],
  },
  {
    host: "jordan",
    title: "3BR on Livingston Ave with central air",
    address: "550 Livingston Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.0463, lng: -76.1276 },
    description:
      "Three bedrooms, central air, and a dishwasher — the summer trifecta. Livingston is a short walk to both campus and Westcott, and the block stays quiet. Furnished, with a big dining table that's good for group study. Parking for two in the back.",
    monthlyRent: 690,
    availableFrom: "2026-05-21",
    availableTo: "2026-08-13",
    utilitiesIncluded: false,
    deposit: 425,
    bedrooms: 3,
    bathrooms: 1.5,
    maxRoommates: 2,
    petsAllowed: false,
    furnished: true,
    privateBath: false,
    amenities: [
      "WiFi",
      "Furnished",
      "AC",
      "Dishwasher",
      "Laundry In-Unit",
      "Parking",
      "Porch",
      "Heating",
    ],
    photos: [P.dining, P.livingRoom, P.bedroom, P.kitchen],
  },
  {
    host: "tyler",
    title: "Room in 4BR on Walnut — utilities included",
    address: "604 Walnut Ave",
    city: "Syracuse",
    state: "NY",
    zip: "13210",
    fallback: { lat: 43.043, lng: -76.1332 },
    description:
      "Single room in a four-bedroom on Walnut, about as close to campus as you can get. Two roommates staying through the summer, both easy to live with. Everything included in rent — heat, electric, internet. Furnished with a full bed and a desk that fits two monitors.",
    monthlyRent: 630,
    availableFrom: "2026-05-18",
    availableTo: "2026-08-11",
    utilitiesIncluded: true,
    deposit: 315,
    bedrooms: 1,
    bathrooms: 2,
    maxRoommates: 3,
    petsAllowed: false,
    furnished: true,
    privateBath: false,
    amenities: [
      "WiFi",
      "Furnished",
      "Heating",
      "AC",
      "Laundry In-Unit",
      "Utilities Included",
      "Dishwasher",
    ],
    photos: [P.bedroom, P.desk, P.livingRoom, P.kitchen],
  },
];

/* -------------------------------------------------------------------- run */

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

function upsertUser(host: SeedHost): string {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(host.email) as
    | { id: string }
    | undefined;
  if (existing) return existing.id;

  const id = newId("usr");
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, university, bio,
                        avatar_initials, verified, rating, review_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    host.email,
    host.name,
    hashPassword(PASSWORD),
    host.university,
    host.bio,
    initialsFor(host.name),
    host.verified ? 1 : 0,
    host.rating,
    host.reviewCount,
    nowIso(),
  );
  const settings = new ScreenSettings(id);
  settings.payload.university = host.university;
  settings.storeData();
  return id;
}

function wipeSeed(): void {
  console.log("  --force: clearing existing listings and accounts…");
  transaction(() => {
    // Listing/photo/pricing/etc. rows cascade from users and listings.
    db.exec("DELETE FROM reports");
    db.exec("DELETE FROM messages");
    db.exec("DELETE FROM conversation_state");
    db.exec("DELETE FROM conversations");
    db.exec("DELETE FROM saved_listings");
    db.exec("DELETE FROM swipes");
    db.exec("DELETE FROM listing_amenities");
    db.exec("DELETE FROM photos");
    db.exec("DELETE FROM pricing");
    db.exec("DELETE FROM room_details");
    db.exec("DELETE FROM listings");
    db.exec("DELETE FROM screen_settings");
    db.exec("DELETE FROM users");
  });
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const existing = db.prepare("SELECT COUNT(*) AS n FROM listings").get() as { n: number };

  if (existing.n > 0 && !force) {
    console.log(
      `\n  Database already has ${existing.n} listing(s). ` +
        "Nothing to do — pass --force to wipe and re-seed.\n",
    );
    return;
  }
  if (force) wipeSeed();

  console.log("\n  Seeding SubletU…\n");

  const hostIds = new Map<string, string>();
  for (const host of HOSTS) hostIds.set(host.key, upsertUser(host));

  // A ready-to-use demo account, plus one more renter so threads have two sides.
  const demoId = upsertUser({
    key: "demo",
    email: "demo@syr.edu",
    name: "Demo Student",
    university: "Syracuse University",
    bio: "Looking for a summer sublet close to campus. Clean, quiet, no pets.",
    verified: true,
    rating: 0,
    reviewCount: 0,
  });
  const renterId = upsertUser({
    key: "renter",
    email: "lwalsh@syr.edu",
    name: "Liam Walsh",
    university: "Syracuse University",
    bio: "Sophomore in Whitman. Summer internship downtown, need something on a bus line.",
    verified: true,
    rating: 0,
    reviewCount: 0,
  });

  console.log(`  ${HOSTS.length} hosts + 2 renter accounts ready.`);
  console.log(`  Geocoding ${LISTINGS.length} addresses against OpenStreetMap (1 req/sec)…\n`);

  let geocoded = 0;
  let fellBack = 0;

  for (const seed of LISTINGS) {
    const ownerId = hostIds.get(seed.host);
    if (!ownerId) throw new Error(`Unknown host key "${seed.host}"`);

    const point = await geocodeAddress(seed.address, seed.city, seed.state);
    if (point) geocoded += 1;
    else fellBack += 1;

    const listingId = newId("lst");
    const createdAt = new Date(Date.now() - LISTINGS.indexOf(seed) * 7_200_000).toISOString();

    const listing = new ListingData({
      listingId,
      ownerId,
      title: seed.title,
      address: seed.address,
      city: seed.city,
      state: seed.state,
      zip: seed.zip,
      description: seed.description,
      lat: point?.lat ?? seed.fallback.lat,
      lng: point?.lng ?? seed.fallback.lng,
      geocodeSource: point ? "nominatim" : "seed_fallback",
      status: "active",
      createdAt,
      updatedAt: createdAt,
      photoData: seed.photos.map((url, i) => PhotoData.fromRemoteUrl(listingId, url, i)),
      pricingData: new PricingData({
        listingId,
        monthlyRent: seed.monthlyRent,
        availableFrom: seed.availableFrom,
        availableTo: seed.availableTo,
        utilitiesIncluded: seed.utilitiesIncluded,
        deposit: seed.deposit,
      }),
      roomDetails: new RoomDetails({
        listingId,
        bedrooms: seed.bedrooms,
        bathrooms: seed.bathrooms,
        maxRoommates: seed.maxRoommates,
        petsAllowed: seed.petsAllowed,
        furnished: seed.furnished,
        privateBath: seed.privateBath,
      }),
      amenities: seed.amenities,
    });

    const problems = listing.validateData();
    if (problems.length > 0) {
      console.error(`  ✗ ${seed.title}: ${problems.join("; ")}`);
      continue;
    }

    transaction(() => listing.storeData());
    const label = point ? "geocoded" : "fallback";
    console.log(
      `  ✓ ${seed.address.padEnd(22)} $${String(seed.monthlyRent).padEnd(5)} ` +
        `${listing.lat?.toFixed(5)}, ${listing.lng?.toFixed(5)}  (${label})`,
    );
  }

  // Two conversations so the Messages tab has something real in it.
  const firstTwo = db
    .prepare("SELECT id, owner_id FROM listings ORDER BY created_at LIMIT 2")
    .all() as Array<{ id: string; owner_id: string }>;

  transaction(() => {
    const openers = [
      {
        from: demoId,
        text: "Hi! Is this still available for the full summer? I'd be the only person staying.",
        reply: "It is — the dates on the listing are accurate. Want to set up a video walkthrough this week?",
      },
      {
        from: renterId,
        text: "Hey — does the rent really cover all utilities, including AC in July?",
        reply: "Yep, everything's included. My July bill was the same as February's.",
      },
    ];

    firstTwo.forEach((listing, i) => {
      const convoId = newId("cnv");
      const t0 = new Date(Date.now() - (i + 1) * 3_600_000).toISOString();
      const t1 = new Date(Date.now() - (i + 1) * 3_000_000).toISOString();
      db.prepare(
        `INSERT INTO conversations (id, listing_id, guest_id, host_id, created_at, last_message_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(convoId, listing.id, openers[i].from, listing.owner_id, t0, t1);
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(newId("msg"), convoId, openers[i].from, openers[i].text, t0);
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(newId("msg"), convoId, listing.owner_id, openers[i].reply, t1);
    });
  });

  const total = db.prepare("SELECT COUNT(*) AS n FROM listings").get() as { n: number };
  console.log(`\n  Done. ${total.n} listings — ${geocoded} geocoded live, ${fellBack} from fallback.`);
  console.log(`  Demo login:  demo@syr.edu / ${PASSWORD}`);
  console.log(`  Host login:  amansour@syr.edu / ${PASSWORD}  (has listings to manage)\n`);
}

main()
  .catch((err) => {
    console.error("\n  Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.close());
