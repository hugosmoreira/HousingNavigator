import { renderToStaticMarkup } from 'react-dom/server';
import { describe,it,expect } from 'vitest';
import ResourceMoreFilters from './ResourceMoreFilters';
import type { ResourceServiceTag } from '../types';

const props={extraCategories:['supportive_services' as const],categories:[],tags:[] as ResourceServiceTag[],onCategory:()=>{},onTag:()=>{}};
describe('compact additional resource filters',()=>{
  it('adds no empty panel when collapsed',()=>{
    expect(renderToStaticMarkup(<ResourceMoreFilters {...props} expanded={false}/>)).toBe('');
  });
  it('puts all additional needs inside one labelled expandable panel',()=>{
    const html=renderToStaticMarkup(<ResourceMoreFilters {...props} expanded/>);
    expect(html).toContain('additional-resource-filters');
    for(const label of ['Moving help','Move-in costs','Furniture','Utility help','Financial education'])expect(html).toContain(label);
    expect(html).toContain('fieldset');expect(html).toContain('type="checkbox"');
  });
  it('retains removable selected tags while collapsed',()=>{
    const html=renderToStaticMarkup(<ResourceMoreFilters {...props} expanded={false} tags={['furniture','utility_help']}/>);
    expect(html).toContain('Remove Furniture filter');
    expect(html).toContain('Remove Utility help filter');
    expect(html).not.toContain('Financial education');
  });
});
