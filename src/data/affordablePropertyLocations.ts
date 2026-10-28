import locationFile from './affordablePropertyLocations.json';

export interface AffordablePropertyLocation {
  lat: number;
  lng: number;
  /** The published address that was geocoded, so edits trigger a new lookup. */
  input_address: string;
  /** The address the geocoder matched, which can reveal typos in the record. */
  matched_address: string;
  geocoded_on: string;
}

export interface AffordablePropertyLocationFile {
  source: string;
  source_url: string;
  locations: Record<string, AffordablePropertyLocation>;
}

export const AFFORDABLE_PROPERTY_LOCATIONS = locationFile as AffordablePropertyLocationFile;
