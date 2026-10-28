import { requireSupabase } from '../lib/supabaseClient';
import { edgeFunctionError } from './curateResources';
import type {
  AddressLookup,
  AddressLookupResponse,
} from '../../supabase/functions/_shared/addressGeocoding.ts';

/** Ask the admin-only `geocode-address` function where an address is. Saves nothing. */
export async function geocodeAddress(lookup: AddressLookup): Promise<AddressLookupResponse> {
  const client = await requireSupabase();
  const { data, error } = await client.functions.invoke<AddressLookupResponse>('geocode-address', {
    body: lookup,
  });
  if (error) throw await edgeFunctionError(error, 'Address lookup');
  if (!data) throw new Error('The address lookup returned no result.');
  return data;
}
