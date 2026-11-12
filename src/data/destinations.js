// Destinations you can start a new trip in, and the places we recommend
// for each.
//
// HONEST LABEL: these lists are picked by hand. They are well-known
// highlights in rough order of fame, NOT ranked by real popularity data.
// Following the project rules, they hold no opening hours, prices, ratings
// or reviews. A later step will rank them and fill those in from a places
// API, and show when that data was fetched.
//
// Each recommendation: { id, name, area, category, why, lat, lng, visitHours }
//   category    'sight', 'nature' or 'food' (see CATEGORY_LABELS in ui/html.js)
//   lat, lng    APPROXIMATE location, typed by hand. Good enough to group
//               nearby places into the same day; a places API will replace them.
//   visitHours  a rough planning guess of how long a visit takes. It is not
//               an opening time; you'll be able to change it later.
//
// Each destination also has `areas`: neighbourhoods to consider staying in,
// { id, name, lat, lng, why }. Also picked by hand, with the APPROXIMATE
// middle of each area. No hotels, prices or reviews: those need a hotel
// data provider.
//
// And `arrivalPoints`: airports, stations and coach stations you can arrive
// at or leave from, { id, name, kind, lat, lng, hub?, transferMinutes?, transfer? }
//   kind             'airport', 'station' or 'coach'
//   hub              for airports: where the usual transfer reaches the city,
//                    { name, lat, lng }. Planning continues from there.
//   transferMinutes  a ROUGH planning guess for airport to hub, including
//                    getting to the train or bus and some waiting. Not a timetable.
//   transfer         how people usually make that trip, in a few words
// Locations are approximate, typed by hand.
import { DISCOVERIES } from './discoveries.js';

export const RECOMMENDATIONS_SOURCE =
  'Starter list picked by hand: well-known highlights in rough order of fame, not ranked by real data yet. ' +
  'Opening hours, prices and reviews will come from a places API.';

export const DESTINATIONS = {
  paris: {
    id: 'paris',
    name: 'Paris',
    country: 'France',
    center: [48.8566, 2.3522],
    timeZone: 'Europe/Paris',
    blurb: 'Museums and landmarks along the Seine, with parks, canals and market streets in between.',
    discoveries: DISCOVERIES.paris, // less obvious places for the "For you" step
    recommendations: [
      { id: 'eiffel', name: 'Eiffel Tower', area: 'Champ de Mars, 7th', category: 'sight', lat: 48.8584, lng: 2.2945, visitHours: 2, why: 'The city’s best-known landmark, with viewing platforms on several levels.' },
      { id: 'louvre', name: 'Musée du Louvre', area: '1st arrondissement', category: 'sight', lat: 48.8606, lng: 2.3376, visitHours: 3, why: 'One of the world’s largest art museums, in a former royal palace. Home of the Mona Lisa.' },
      { id: 'notre-dame', name: 'Notre-Dame de Paris', area: 'Île de la Cité', category: 'sight', lat: 48.853, lng: 2.3499, visitHours: 1, why: 'Gothic cathedral on an island in the Seine, reopened in December 2024 after the 2019 fire.' },
      { id: 'montmartre', name: 'Montmartre and Sacré-Cœur', area: '18th arrondissement', category: 'sight', lat: 48.8867, lng: 2.3431, visitHours: 2, why: 'Hilltop village of steep streets and stairways, topped by a white basilica with a wide view over the city.' },
      { id: 'arc', name: 'Arc de Triomphe', area: 'Top of the Champs-Élysées', category: 'sight', lat: 48.8738, lng: 2.295, visitHours: 1, why: 'Monumental arch with a rooftop terrace looking down the avenues that meet around it.' },
      { id: 'orsay', name: 'Musée d’Orsay', area: '7th arrondissement', category: 'sight', lat: 48.86, lng: 2.3266, visitHours: 2.5, why: 'Impressionist and post-impressionist art in a former railway station on the Seine.' },
      { id: 'sainte-chapelle', name: 'Sainte-Chapelle', area: 'Île de la Cité', category: 'sight', lat: 48.8554, lng: 2.345, visitHours: 1, why: 'Small Gothic royal chapel known for its walls of stained glass.' },
      { id: 'seine-cruise', name: 'Seine river cruise', area: 'Central Paris', category: 'sight', lat: 48.8572, lng: 2.3411, visitHours: 1, why: 'Boat trips on the Seine pass many of the main landmarks from the water.' },
      { id: 'marais', name: 'Le Marais', area: '3rd and 4th arrondissements', category: 'sight', lat: 48.8556, lng: 2.3655, visitHours: 2, why: 'Old district of narrow streets around the Place des Vosges, full of small museums and shops.' },
      { id: 'luxembourg', name: 'Jardin du Luxembourg', area: '6th arrondissement', category: 'nature', lat: 48.8462, lng: 2.3371, visitHours: 1.5, why: 'Formal gardens around the Luxembourg Palace, with tree-lined paths and a large pond.' },
      { id: 'tuileries', name: 'Jardin des Tuileries', area: '1st arrondissement', category: 'nature', lat: 48.8635, lng: 2.3275, visitHours: 1, why: 'Formal gardens stretching from the Louvre to the Place de la Concorde.' },
      { id: 'canal-st-martin', name: 'Canal Saint-Martin', area: '10th arrondissement', category: 'nature', lat: 48.8715, lng: 2.365, visitHours: 1.5, why: 'Tree-lined canal with iron footbridges and locks, made for a waterside walk.' },
      { id: 'buttes-chaumont', name: 'Parc des Buttes-Chaumont', area: '19th arrondissement', category: 'nature', lat: 48.8809, lng: 2.3828, visitHours: 1.5, why: 'Hilly park with a lake, cliffs and a small temple on a rocky island. The closest thing to a hike in the city.' },
      { id: 'enfants-rouges', name: 'Marché des Enfants Rouges', area: 'Le Marais', category: 'food', lat: 48.863, lng: 2.3622, visitHours: 1, why: 'The city’s oldest covered market, now mostly food stalls from many cuisines.' },
      { id: 'rue-cler', name: 'Rue Cler', area: '7th arrondissement', category: 'food', lat: 48.8564, lng: 2.3064, visitHours: 1, why: 'Pedestrian market street lined with food shops, a short walk from the Eiffel Tower.' },
      { id: 'aligre', name: 'Marché d’Aligre', area: '12th arrondissement', category: 'food', lat: 48.8494, lng: 2.378, visitHours: 1, why: 'Open-air produce market beside a covered food hall, the Marché Beauvau.' },
      { id: 'versailles', name: 'Palace of Versailles', area: 'Day trip outside Paris', category: 'sight', lat: 48.8049, lng: 2.1204, visitHours: 5, why: 'Former royal palace with vast formal gardens and a park, reached by train from the city.' },
    ],
    areas: [
      { id: 'marais', name: 'Le Marais', lat: 48.8590, lng: 2.3600, why: 'Central and walkable, full of places to eat, with the Marché des Enfants Rouges.' },
      { id: 'saint-germain', name: 'Saint-Germain-des-Prés', lat: 48.8540, lng: 2.3330, why: 'Left Bank, close to the Seine and the Luxembourg Gardens.' },
      { id: 'latin-quarter', name: 'Latin Quarter', lat: 48.8490, lng: 2.3470, why: 'Lively student area near Notre-Dame, with the Rue Mouffetard food street.' },
      { id: 'louvre-opera', name: 'Louvre and Opéra', lat: 48.8680, lng: 2.3360, why: 'Very central, with many metro lines; busy and more business-like.' },
      { id: 'bastille', name: 'Bastille', lat: 48.8530, lng: 2.3690, why: 'Good metro links, near the Marché d’Aligre and the start of the Coulée verte.' },
      { id: 'canal-saint-martin', name: 'Canal Saint-Martin', lat: 48.8710, lng: 2.3650, why: 'Local feel, with walks along the canal and plenty of small restaurants.' },
      { id: 'montmartre', name: 'Montmartre', lat: 48.8860, lng: 2.3400, why: 'Hilltop village feel and views; further from the riverside sights.' },
      { id: 'rue-cler', name: 'Eiffel Tower and Rue Cler', lat: 48.8570, lng: 2.3010, why: 'Quieter and residential, with the Rue Cler market street.' },
    ],
    arrivalPoints: [
      { id: 'cdg', name: 'Paris Charles de Gaulle airport (CDG)', kind: 'airport', lat: 49.0097, lng: 2.5479, hub: { name: 'Gare du Nord', lat: 48.8809, lng: 2.3553 }, transferMinutes: 50, transfer: 'RER B train or a taxi' },
      { id: 'ory', name: 'Paris Orly airport (ORY)', kind: 'airport', lat: 48.7262, lng: 2.3652, hub: { name: 'Châtelet', lat: 48.8584, lng: 2.3470 }, transferMinutes: 45, transfer: 'Metro line 14 or a taxi' },
      { id: 'bva', name: 'Paris Beauvais airport (BVA)', kind: 'airport', lat: 49.4544, lng: 2.1128, hub: { name: 'Porte Maillot', lat: 48.8781, lng: 2.2829 }, transferMinutes: 95, transfer: 'airport coach' },
      { id: 'gare-du-nord', name: 'Gare du Nord', kind: 'station', lat: 48.8809, lng: 2.3553 },
      { id: 'gare-de-lyon', name: 'Gare de Lyon', kind: 'station', lat: 48.8443, lng: 2.3743 },
      { id: 'gare-de-l-est', name: 'Gare de l’Est', kind: 'station', lat: 48.8768, lng: 2.3592 },
      { id: 'montparnasse', name: 'Gare Montparnasse', kind: 'station', lat: 48.8412, lng: 2.3200 },
      { id: 'saint-lazare', name: 'Gare Saint-Lazare', kind: 'station', lat: 48.8763, lng: 2.3253 },
      { id: 'austerlitz', name: 'Gare d’Austerlitz', kind: 'station', lat: 48.8420, lng: 2.3655 },
      { id: 'bercy-coach', name: 'Paris Bercy Seine coach station', kind: 'coach', lat: 48.8386, lng: 2.3825 },
    ],
  },

  rome: {
    id: 'rome',
    name: 'Rome',
    country: 'Italy',
    center: [41.8986, 12.4768],
    timeZone: 'Europe/Rome',
    blurb: 'Ancient ruins, baroque squares and the Vatican, with hilltop views, big parks and neighbourhood markets.',
    discoveries: DISCOVERIES.rome,
    recommendations: [
      { id: 'colosseum', name: 'Colosseum', area: 'Celio', category: 'sight', lat: 41.8902, lng: 12.4922, visitHours: 1.5, why: 'The largest amphitheatre of ancient Rome, still standing at the centre of the city.' },
      { id: 'forum', name: 'Roman Forum and Palatine Hill', area: 'Next to the Colosseum', category: 'sight', lat: 41.8925, lng: 12.4853, visitHours: 2.5, why: 'Ruins of ancient Rome’s centre of public life, beside the hill where emperors built their palaces.' },
      { id: 'vatican-museums', name: 'Vatican Museums and Sistine Chapel', area: 'Vatican City', category: 'sight', lat: 41.9065, lng: 12.4536, visitHours: 3.5, why: 'The papal art collections, ending in the chapel painted by Michelangelo.' },
      { id: 'st-peters', name: 'St Peter’s Basilica', area: 'Vatican City', category: 'sight', lat: 41.9022, lng: 12.4539, visitHours: 1.5, why: 'Vast Renaissance basilica on St Peter’s Square, with a dome you can climb.' },
      { id: 'pantheon', name: 'Pantheon', area: 'Centro Storico', category: 'sight', lat: 41.8986, lng: 12.4769, visitHours: 0.75, why: 'Ancient Roman temple, later a church, with a huge concrete dome open to the sky at its centre.' },
      { id: 'trevi', name: 'Trevi Fountain', area: 'Trevi', category: 'sight', lat: 41.9009, lng: 12.4833, visitHours: 0.5, why: 'Baroque fountain where visitors traditionally throw a coin over their shoulder.' },
      { id: 'navona', name: 'Piazza Navona', area: 'Centro Storico', category: 'sight', lat: 41.8992, lng: 12.4731, visitHours: 0.5, why: 'Long baroque square on the site of an ancient stadium, with Bernini’s Fountain of the Four Rivers.' },
      { id: 'spanish-steps', name: 'Spanish Steps', area: 'Piazza di Spagna', category: 'sight', lat: 41.9058, lng: 12.4823, visitHours: 0.5, why: 'Wide stairway climbing from Piazza di Spagna to the Trinità dei Monti church.' },
      { id: 'castel-sant-angelo', name: 'Castel Sant’Angelo', area: 'Beside the Tiber', category: 'sight', lat: 41.9031, lng: 12.4663, visitHours: 1.5, why: 'Emperor Hadrian’s tomb, later a papal fortress, with a terrace over the river.' },
      { id: 'trastevere', name: 'Trastevere', area: 'Across the Tiber', category: 'sight', lat: 41.8894, lng: 12.47, visitHours: 2, why: 'Neighbourhood of narrow streets and small squares, known for its trattorias.' },
      { id: 'villa-borghese', name: 'Villa Borghese gardens', area: 'Above Piazza del Popolo', category: 'nature', lat: 41.9128, lng: 12.4852, visitHours: 2, why: 'Large landscaped park with a lake, wooded paths and the Pincio terrace view. The Galleria Borghese is inside.' },
      { id: 'gianicolo', name: 'Janiculum Hill (Gianicolo)', area: 'Above Trastevere', category: 'nature', lat: 41.8913, lng: 12.4613, visitHours: 1.5, why: 'Hill walk up from Trastevere to one of the widest views over the city’s roofs and domes.' },
      { id: 'appia-antica', name: 'Appian Way (Appia Antica)', area: 'South-east of the centre', category: 'nature', lat: 41.8586, lng: 12.5156, visitHours: 4, why: 'Ancient Roman road through a regional park, good for a long walk or a bike ride past tombs and ruins.' },
      { id: 'acquedotti', name: 'Parco degli Acquedotti', area: 'South-east Rome', category: 'nature', lat: 41.8521, lng: 12.5583, visitHours: 2, why: 'Open parkland crossed by the arches of ancient aqueducts.' },
      { id: 'campo-de-fiori', name: 'Campo de’ Fiori', area: 'Centro Storico', category: 'food', lat: 41.8956, lng: 12.4722, visitHours: 0.75, why: 'Square with a long-running produce and flower market.' },
      { id: 'testaccio-market', name: 'Mercato di Testaccio', area: 'Testaccio', category: 'food', lat: 41.8766, lng: 12.4757, visitHours: 1, why: 'Covered neighbourhood market with produce stalls and Roman street food.' },
      { id: 'ghetto', name: 'Jewish Ghetto', area: 'Near the Tiber Island', category: 'food', lat: 41.8925, lng: 12.4777, visitHours: 1, why: 'Historic quarter known for Roman-Jewish cooking, such as fried artichokes.' },
    ],
    areas: [
      { id: 'centro-storico', name: 'Centro Storico', lat: 41.8990, lng: 12.4740, why: 'The heart of the old city, around the Pantheon and Piazza Navona. Most sights are a walk away.' },
      { id: 'monti', name: 'Monti', lat: 41.8950, lng: 12.4920, why: 'Next to the Colosseum and the Forum, with small bars and shops.' },
      { id: 'trastevere', name: 'Trastevere', lat: 41.8890, lng: 12.4700, why: 'Cobbled streets full of trattorias; lively in the evening.' },
      { id: 'prati', name: 'Prati', lat: 41.9070, lng: 12.4600, why: 'Calm and residential, next to the Vatican, near the Mercato Trionfale.' },
      { id: 'tridente', name: 'Spanish Steps (Tridente)', lat: 41.9060, lng: 12.4810, why: 'Elegant shopping streets between the Spanish Steps and Piazza del Popolo, near Villa Borghese.' },
      { id: 'testaccio', name: 'Testaccio', lat: 41.8770, lng: 12.4760, why: 'Local food neighbourhood around the Mercato di Testaccio.' },
      { id: 'esquilino', name: 'Esquilino (near Termini)', lat: 41.8980, lng: 12.5020, why: 'By the main station, on both metro lines; handy for day trips by train.' },
    ],
    arrivalPoints: [
      { id: 'fco', name: 'Rome Fiumicino airport (FCO)', kind: 'airport', lat: 41.8003, lng: 12.2389, hub: { name: 'Roma Termini', lat: 41.9010, lng: 12.5018 }, transferMinutes: 50, transfer: 'Leonardo Express train or a taxi' },
      { id: 'cia', name: 'Rome Ciampino airport (CIA)', kind: 'airport', lat: 41.7994, lng: 12.5949, hub: { name: 'Roma Termini', lat: 41.9010, lng: 12.5018 }, transferMinutes: 55, transfer: 'airport bus or a taxi' },
      { id: 'termini', name: 'Roma Termini', kind: 'station', lat: 41.9010, lng: 12.5018 },
      { id: 'tiburtina', name: 'Roma Tiburtina', kind: 'station', lat: 41.9106, lng: 12.5306 },
      { id: 'ostiense', name: 'Roma Ostiense', kind: 'station', lat: 41.8721, lng: 12.4847 },
      { id: 'tiburtina-coach', name: 'Tiburtina coach station', kind: 'coach', lat: 41.9104, lng: 12.5313 },
    ],
  },
};

// Every place you can pick in a destination: the popular recommendations
// first (most famous first), then the less obvious "For you" places.
export function allPlaces(dest) {
  return [...dest.recommendations, ...dest.discoveries];
}
