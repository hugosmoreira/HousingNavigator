import { describe, expect, it } from 'vitest';
import { COUNTIES_BY_STATE, SUPPORTED_STATES } from '../data/serviceAreas';
import { parseResourceLocation, resourceSearchContext } from './resourceSearchLocation';

describe('location recognition', () => {
  it.each([
    ['rent help in Spokane', 'rent help', 'WA', 'Spokane'],
    ['rent help Spokane', 'rent help', 'WA', 'Spokane'],
    ['Spokane rent help', 'rent help', 'WA', 'Spokane'],
    ['Spokane Valley rent assistance', 'rent assistance', 'WA', 'Spokane'],
    ['utility help Jackson County OR', 'utility help', 'OR', 'Jackson'],
    ['moving truck in Bend', 'moving truck', 'OR', 'Deschutes'],
    ['help with move in costs in Bend', 'help with move in costs', 'OR', 'Deschutes'],
    ['utility help in Jackson County', 'utility help', 'OR', 'Jackson'],
    ['Rent help near SPOKANE, wa!', 'Rent help', 'WA', 'Spokane'],
    ['shelter around Tacoma for families', 'shelter for families', 'WA', 'Pierce'],
    ['housing in Bend for people in crisis', 'housing for people in crisis', 'OR', 'Deschutes'],
    ['rent in Benton County, Oregon', 'rent', 'OR', 'Benton'],
    ['rent in Benton County WA', 'rent', 'WA', 'Benton'],
    ['help in Washington County', 'help', 'OR', 'Washington'],
    ['help in Washington state', 'help', 'WA', null],
    ['housing in Oregon', 'housing', 'OR', null],
    ['Seattle', '', 'WA', 'King'],
    ['Spokane Valley', '', 'WA', 'Spokane'],
  ])('%s separates place and service words', (query, text, state, county) => {
    expect(parseResourceLocation(query)).toMatchObject({ text, status: 'resolved', choices: [{ state, county }] });
  });

  it('supports every county with an explicit state without guessing shared names', () => {
    for (const state of SUPPORTED_STATES) for (const county of COUNTIES_BY_STATE[state]) {
      expect(parseResourceLocation(`rent in ${county} County, ${state}`).choices).toEqual([{ state, county }]);
    }
  });

  it.each(['Benton', 'Columbia', 'Douglas', 'Grant', 'Jefferson', 'Lincoln'])('requires a state for %s County', county => {
    const result = resourceSearchContext(`help in ${county} County`);
    expect(result.needsChoice).toBe(true);
    expect(result.choices).toEqual([{ state: 'OR', county }, { state: 'WA', county }]);
  });

  it('does not collapse a multi-county city into the main county', () => {
    expect(resourceSearchContext('rent in Portland').needsChoice).toBe(true);
    expect(parseResourceLocation('rent in Portland').choices).toHaveLength(3);
    expect(parseResourceLocation('rent in Redmond').choices).toEqual([
      { state: 'OR', county: 'Deschutes' }, { state: 'WA', county: 'King' },
    ]);
  });

  it.each(['Spokne', 'Spokaen', 'Spoknae'])('offers confirmation for the typo %s', place => {
    const result = resourceSearchContext(`rent in ${place}`);
    expect(result.status).toBe('suggestion');
    expect(result.needsChoice).toBe(true);
    expect(result.location).toBeNull();
    expect(result.choices).toContainEqual({ state: 'WA', county: 'Spokane' });
  });

  it.each(['Boston', 'Vancouver BC', 'Spokane Idaho', 'Washington DC', 'me', 'Seattle and Spokane'])('does not call unrelated results local to %s', place => {
    const result = resourceSearchContext(`rent near ${place}`);
    expect(result.status).toBe('unrecognized');
    expect(result.needsChoice).toBe(true);
  });

  it.each(['Washington Tenants Union', 'Oregon Law Center', 'Multnomah County Joint Office of Homeless Services', 'evicton', 'help with move in costs', 'help in person', 'walk-in shelter', 'rent help'])('keeps ordinary keyword/provider searches intact: %s', query => {
    expect(parseResourceLocation(query)).toMatchObject({ text: query, status: 'none', mention: null });
  });

  it('manual county, state or All explicitly overrides a conflicting query location', () => {
    expect(resourceSearchContext('rent in Spokane', { state: 'OR', county: 'Jackson' })).toMatchObject({
      text: 'rent', manual: true, needsChoice: false, location: { state: 'OR', county: 'Jackson' },
    });
    expect(resourceSearchContext('rent in Benton County', { state: 'WA', county: null }).needsChoice).toBe(false);
    expect(resourceSearchContext('rent in Spokane', null)).toMatchObject({ manual: true, location: null, text: 'rent' });
    expect(resourceSearchContext('rent in Spokane', undefined).location).toEqual({ state: 'WA', county: 'Spokane' });
  });

  it('requires clarification instead of choosing the last of two requested locations', () => {
    expect(resourceSearchContext('rent in Spokane or near Seattle')).toMatchObject({
      text: 'rent', needsChoice: true, location: null,
    });
  });

  it.each(['Outside In – Young Adult Day Program', 'Just in Case Oregon - Free Mailed Naloxone', 'aging in place'])('preserves the non-geographic phrase %s', query => {
    expect(parseResourceLocation(query)).toMatchObject({ text: query, status: 'none', mention: null });
  });
});
