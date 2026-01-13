/**
 * Component: Audible Region Types
 * Documentation: documentation/integrations/audible.md
 */

export type AudibleRegion = 'us' | 'ca' | 'uk' | 'au' | 'in';

export interface AudibleRegionConfig {
  code: AudibleRegion;
  name: string;
  baseUrl: string;
  audnexusParam: string;
}

export const AUDIBLE_REGIONS: Record<AudibleRegion, AudibleRegionConfig> = {
  us: {
    code: 'us',
    name: 'United States',
    baseUrl: 'https://www.audible.com',
    audnexusParam: 'us',
  },
  ca: {
    code: 'ca',
    name: 'Canada',
    baseUrl: 'https://www.audible.ca',
    audnexusParam: 'ca',
  },
  uk: {
    code: 'uk',
    name: 'United Kingdom',
    baseUrl: 'https://www.audible.co.uk',
    audnexusParam: 'uk',
  },
  au: {
    code: 'au',
    name: 'Australia',
    baseUrl: 'https://www.audible.com.au',
    audnexusParam: 'au',
  },
  in: {
    code: 'in',
    name: 'India',
    baseUrl: 'https://www.audible.in',
    audnexusParam: 'in',
  },
};

export const DEFAULT_AUDIBLE_REGION: AudibleRegion = 'us';
