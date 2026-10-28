/**
 * Camera destinations for neighborhood search. These are approximate centers
 * of City of Portland neighborhood associations (checked against
 * OpenStreetMap boundaries on 2026-10-27). They move the camera only; they
 * never imply that housing exists in a neighborhood.
 */
export interface MapPlace {
  name: string;
  /** Extra words people may type, such as a common short name. */
  aliases?: string[];
  lat: number;
  lng: number;
  zoom: number;
}

export const PORTLAND_OVERVIEW = { lat: 45.512, lng: -122.62, zoom: 11.2 };

export const PORTLAND_PLACES: MapPlace[] = [
  { name: 'Downtown', lat: 45.5153, lng: -122.68, zoom: 15 },
  { name: 'Pearl District', aliases: ['pearl'], lat: 45.529, lng: -122.6816, zoom: 15 },
  { name: 'Old Town Chinatown', aliases: ['old town', 'chinatown'], lat: 45.5249, lng: -122.6735, zoom: 15.2 },
  { name: 'Goose Hollow', lat: 45.5177, lng: -122.6928, zoom: 15 },
  { name: 'South Portland', aliases: ['south waterfront'], lat: 45.4883, lng: -122.6764, zoom: 14.4 },
  { name: 'Lloyd', aliases: ['lloyd district'], lat: 45.5314, lng: -122.6601, zoom: 15 },
  { name: 'Buckman', aliases: ['central eastside'], lat: 45.5174, lng: -122.652, zoom: 15 },
  { name: 'Kerns', lat: 45.5268, lng: -122.6445, zoom: 15 },
  { name: 'Boise', aliases: ['mississippi'], lat: 45.5502, lng: -122.6719, zoom: 15 },
  { name: 'King', aliases: ['alberta'], lat: 45.5578, lng: -122.6584, zoom: 15 },
  { name: 'Cully', lat: 45.5615, lng: -122.6021, zoom: 14.4 },
  { name: 'St. Johns', aliases: ['saint johns'], lat: 45.5981, lng: -122.7455, zoom: 14.6 },
  { name: 'Sellwood-Moreland', aliases: ['sellwood', 'moreland'], lat: 45.4715, lng: -122.6514, zoom: 14.6 },
  { name: 'Montavilla', lat: 45.5191, lng: -122.5765, zoom: 14.6 },
  { name: 'Foster-Powell', aliases: ['foster'], lat: 45.4932, lng: -122.5892, zoom: 14.8 },
  { name: 'Mt. Scott-Arleta', aliases: ['mount scott', 'arleta'], lat: 45.4814, lng: -122.5914, zoom: 14.8 },
  { name: 'Brentwood-Darlington', lat: 45.4687, lng: -122.5976, zoom: 14.6 },
  { name: 'Lents', lat: 45.4797, lng: -122.5645, zoom: 14.6 },
  { name: 'Powellhurst-Gilbert', lat: 45.4926, lng: -122.5387, zoom: 14.4 },
  { name: 'Gateway', lat: 45.5335, lng: -122.5582, zoom: 14.8 },
  { name: 'Hazelwood', lat: 45.5239, lng: -122.5383, zoom: 14.4 },
  { name: 'Centennial', lat: 45.5056, lng: -122.4997, zoom: 14.4 },
];

export function matchPlaces(query: string, limit = 4): MapPlace[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  return PORTLAND_PLACES.filter((place) =>
    [place.name, ...(place.aliases ?? [])].some((label) => label.toLowerCase().includes(needle)),
  ).slice(0, limit);
}
