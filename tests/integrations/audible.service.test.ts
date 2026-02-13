/**
 * Component: Audible Integration Service Tests
 * Documentation: documentation/integrations/audible.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudibleService } from '@/lib/integrations/audible.service';
import { AUDIBLE_REGIONS, DEFAULT_AUDIBLE_REGION } from '@/lib/types/audible';

const clientMock = vi.hoisted(() => ({
  get: vi.fn(),
}));

const axiosMock = vi.hoisted(() => ({
  create: vi.fn(() => clientMock),
  get: vi.fn(),
}));

const configServiceMock = vi.hoisted(() => ({
  getAudibleRegion: vi.fn(),
}));

const fsCoreMock = vi.hoisted(() => ({
  writeFileSync: vi.fn(),
}));

vi.mock('axios', () => ({
  default: axiosMock,
  ...axiosMock,
}));

vi.mock('@/lib/services/config.service', () => ({
  getConfigService: () => configServiceMock,
}));

vi.mock('fs', () => fsCoreMock);

describe('AudibleService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.get.mockReset();
    axiosMock.get.mockReset();
    configServiceMock.getAudibleRegion.mockReset();
  });

  const buildListHtml = (count: number, startIndex: number = 0) =>
    Array.from({ length: count }, (_, i) => {
      const asin = `B${String(i + 1 + startIndex).padStart(9, '0')}`;
      return `
        <div class="productListItem">
          <li data-asin="${asin}"></li>
          <h3><a>Title ${i + 1}</a></h3>
          <span class="authorLabel">By: Author ${i + 1}</span>
          <span class="narratorLabel">Narrated by: Narrator ${i + 1}</span>
          <img src="https://images-na.ssl-images-amazon.com/images/I/abc._SL200_.jpg" />
          <span class="ratingsLabel">4.${i} out of 5 stars</span>
        </div>
      `;
    }).join('');

  it('parses search results from HTML', async () => {
    const html = `
      <div class="s-result-item">
        <li data-asin="B000123456"></li>
        <h2>The Test Book</h2>
        <a href="/author/Author-Name">Author Name</a>
        <span class="narratorLabel">Narrated by: Narrator Name</span>
        <img src="https://images-na.ssl-images-amazon.com/images/I/abc._SL200_.jpg" />
        <span class="runtimeLabel">Length: 5 hrs and 30 mins</span>
        <span class="ratingsLabel">4.5 out of 5 stars</span>
      </div>
      <div class="resultsInfo">1-20 of 55 results</div>
    `;

    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    clientMock.get.mockResolvedValueOnce({ data: html });

    const service = new AudibleService();
    const result = await service.search('test', 1);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].asin).toBe('B000123456');
    expect(result.results[0].title).toBe('The Test Book');
    expect(result.results[0].author).toBe('Author Name');
    expect(result.results[0].narrator).toBe('Narrator Name');
    expect(result.results[0].durationMinutes).toBe(330);
    expect(result.results[0].rating).toBe(4.5);
    expect(result.results[0].coverArtUrl).toContain('_SL500_');
    expect(result.totalResults).toBe(55);
    expect(result.hasMore).toBe(true);
  });

  it('reinitializes when the configured region changes', async () => {
    const html = `<div class="resultsInfo">0 results</div>`;
    configServiceMock.getAudibleRegion
      .mockResolvedValueOnce('us')
      .mockResolvedValueOnce('uk')
      .mockResolvedValueOnce('uk');
    clientMock.get.mockResolvedValue({ data: html });

    const service = new AudibleService();
    await service.search('test', 1);
    await service.search('test', 1);

    expect(axiosMock.create).toHaveBeenCalledTimes(2);
    expect(axiosMock.create.mock.calls[1][0].baseURL).toBe(AUDIBLE_REGIONS.uk.baseUrl);
  });

  it('reinitializes when forced manually', async () => {
    const html = `<div class="resultsInfo">0 results</div>`;
    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    clientMock.get.mockResolvedValue({ data: html });

    const service = new AudibleService();
    await service.search('test', 1);
    service.forceReinitialize();
    await service.search('test', 1);

    expect(axiosMock.create).toHaveBeenCalledTimes(2);
  });

  it('falls back to default region when initialization fails', async () => {
    const html = `<div class="resultsInfo">0 results</div>`;
    configServiceMock.getAudibleRegion.mockRejectedValue(new Error('config fail'));
    clientMock.get.mockResolvedValue({ data: html });

    const service = new AudibleService();
    const result = await service.search('fallback', 1);

    expect(result.totalResults).toBe(0);
    expect(axiosMock.create.mock.calls[0][0].baseURL).toBe(AUDIBLE_REGIONS[DEFAULT_AUDIBLE_REGION].baseUrl);
  });

  it('paginates new releases and respects delays between pages', async () => {
    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    clientMock.get
      .mockResolvedValueOnce({ data: buildListHtml(50, 0) })
      .mockResolvedValueOnce({ data: buildListHtml(25, 50) });

    const service = new AudibleService();
    const delaySpy = vi.spyOn(service as any, 'delay').mockResolvedValue(undefined);
    const results = await service.getNewReleases(75);

    expect(results).toHaveLength(75);
    expect(delaySpy).toHaveBeenCalledTimes(1);
  });

  it('parses popular audiobooks and stops early when fewer results are found', async () => {
    const html = `
      <div class="productListItem">
        <li data-asin="B000111111"></li>
        <h3><a>Popular One</a></h3>
        <span class="authorLabel">By: Author One</span>
        <span class="narratorLabel">Narrated by: Narrator One</span>
        <img src="https://images-na.ssl-images-amazon.com/images/I/abc._SL200_.jpg" />
        <span class="ratingsLabel">4.2 out of 5 stars</span>
      </div>
    `;

    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    clientMock.get.mockResolvedValueOnce({ data: html });

    const service = new AudibleService();
    const results = await service.getPopularAudiobooks(1);

    expect(results).toHaveLength(1);
    expect(results[0].asin).toBe('B000111111');
    expect(results[0].title).toBe('Popular One');
  });

  it('skips duplicate ASINs when parsing new releases', async () => {
    const html = `
      <div class="productListItem">
        <li data-asin="B000222222"></li>
        <h3><a>Title One</a></h3>
      </div>
      <div class="productListItem">
        <li data-asin="B000222222"></li>
        <h3><a>Title Two</a></h3>
      </div>
    `;

    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    clientMock.get.mockResolvedValueOnce({ data: html });

    const service = new AudibleService();
    const results = await service.getNewReleases(20);

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Title One');
  });

  it('returns empty search results on failures', async () => {
    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    // Use 404 error which is not retryable
    const error: any = new Error('Not Found');
    error.response = { status: 404 };
    clientMock.get.mockRejectedValue(error);

    const service = new AudibleService();
    const result = await service.search('oops', 1);

    expect(result.results).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it('returns audiobooks from Audnexus when available', async () => {
    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    axiosMock.get.mockResolvedValueOnce({
      data: {
        title: 'Audnexus Book',
        authors: [{ name: 'Author A' }],
        narrators: [{ name: 'Narrator A' }],
        description: 'Desc',
        image: 'https://images.example.com/cover._SL200_.jpg',
        runtimeLengthMin: '300',
        genres: ['Fiction'],
        rating: '4.7',
      },
    });

    const service = new AudibleService();
    const details = await service.getAudiobookDetails('B000AAAAAA');

    expect(details?.title).toBe('Audnexus Book');
    expect(details?.author).toBe('Author A');
    expect(details?.durationMinutes).toBe(300);
    expect(details?.coverArtUrl).toContain('_SL500_');
  });

  it('scrapes details from HTML when Audnexus fails', async () => {
    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    axiosMock.get.mockRejectedValueOnce({ response: { status: 500 }, message: 'boom' });

    const html = `
      <script type="application/ld+json">{invalid}</script>
      <div class="product-top-section">
        <h1 class="bc-heading">HTML Title</h1>
        <li class="authorLabel"><a>By: HTML Author</a></li>
        <li class="narratorLabel"><a>Narrated by: HTML Narrator</a></li>
        <li class="runtimeLabel"><span>Length: 2 hrs and 5 mins</span></li>
        <li>Release date: Jan 2, 2022</li>
        <span class="ratingsLabel">4.8 out of 5 stars</span>
        <img class="bc-image-inset-border" src="https://images.example.com/cover._SL200_.jpg" />
        <div class="bc-expander-content">
          This is a long description for testing the Audible HTML parsing logic.
        </div>
        <a href="/cat/fiction">Fiction</a>
      </div>
    `;

    clientMock.get.mockResolvedValueOnce({ data: html });

    const service = new AudibleService();
    const details = await service.getAudiobookDetails('B000CCCCCC');

    expect(details?.title).toBe('HTML Title');
    expect(details?.author).toBe('HTML Author');
    expect(details?.narrator).toBe('HTML Narrator');
    expect(details?.durationMinutes).toBe(125);
    expect(details?.rating).toBe(4.8);
    expect(details?.releaseDate).toBe('Jan 2, 2022');
    expect(details?.coverArtUrl).toContain('_SL500_');
    expect(details?.genres).toContain('Fiction');
  });

  it('falls back to Audible scraping when Audnexus returns 404', async () => {
    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    axiosMock.get.mockRejectedValueOnce({ response: { status: 404 }, message: 'Not found' });

    const html = `
      <script type="application/ld+json">
        {
          "@type": "Product",
          "name": "Fallback Book",
          "author": {"name": "Fallback Author"},
          "readBy": {"name": "Fallback Narrator"},
          "description": "A long description that exceeds fifty characters for validation.",
          "image": "https://images.example.com/cover._SL200_.jpg",
          "aggregateRating": { "ratingValue": "4.6" },
          "datePublished": "Jan 1, 2024",
          "duration": "PT8H30M"
        }
      </script>
    `;

    clientMock.get.mockResolvedValueOnce({ data: html });

    const service = new AudibleService();
    const details = await service.getAudiobookDetails('B000BBBBBB');

    expect(details?.title).toBe('Fallback Book');
    expect(details?.author).toBe('Fallback Author');
    expect(details?.durationMinutes).toBe(510);
  });

  it('returns runtime from Audnexus data', async () => {
    axiosMock.get.mockResolvedValue({ data: { runtimeLengthMin: '480' } });

    const service = new AudibleService();
    const runtime = await service.getRuntime('B000123456');

    expect(runtime).toBe(480);
  });

  it('returns null runtime when Audnexus returns 404', async () => {
    axiosMock.get.mockRejectedValue({ response: { status: 404 }, message: 'Not found' });

    const service = new AudibleService();
    const runtime = await service.getRuntime('B000404404');

    expect(runtime).toBeNull();
  });

  it('returns null runtime when Audnexus errors unexpectedly', async () => {
    axiosMock.get.mockRejectedValue({ response: { status: 500 }, message: 'Boom' });

    const service = new AudibleService();
    const runtime = await service.getRuntime('B000500500');

    expect(runtime).toBeNull();
  });

  it('parses runtime strings into minutes', () => {
    const service = new AudibleService();
    const parseRuntime = (service as any).parseRuntime.bind(service);

    expect(parseRuntime('Length: 1 hr and 5 mins')).toBe(65);
    expect(parseRuntime('Length: 45 mins')).toBe(45);
    expect(parseRuntime('')).toBeUndefined();
  });

  it('does not reinitialize when the region is unchanged', async () => {
    const html = `<div class="resultsInfo">0 results</div>`;
    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    clientMock.get.mockResolvedValue({ data: html });

    const service = new AudibleService();
    await service.search('test', 1);
    await service.search('test', 1);

    expect(axiosMock.create).toHaveBeenCalledTimes(1);
  });

  it('paginates popular audiobooks across pages', async () => {
    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    clientMock.get
      .mockResolvedValueOnce({ data: buildListHtml(50, 0) })
      .mockResolvedValueOnce({ data: buildListHtml(25, 50) });

    const service = new AudibleService();
    const delaySpy = vi.spyOn(service as any, 'delay').mockResolvedValue(undefined);
    const results = await service.getPopularAudiobooks(75);

    expect(results).toHaveLength(75);
    expect(delaySpy).toHaveBeenCalledTimes(1);
  });

  it('returns empty popular audiobooks on errors', async () => {
    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    // Use 404 error which is not retryable
    const error: any = new Error('Not Found');
    error.response = { status: 404 };
    clientMock.get.mockRejectedValue(error);

    const service = new AudibleService();
    const results = await service.getPopularAudiobooks(5);

    expect(results).toEqual([]);
  });

  it('returns empty new releases on errors', async () => {
    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    // Use 404 error which is not retryable
    const error: any = new Error('Not Found');
    error.response = { status: 404 };
    clientMock.get.mockRejectedValue(error);

    const service = new AudibleService();
    const results = await service.getNewReleases(5);

    expect(results).toEqual([]);
  });

  it('returns null when getAudiobookDetails throws', async () => {
    configServiceMock.getAudibleRegion.mockResolvedValue('us');

    const service = new AudibleService();
    vi.spyOn(service as any, 'fetchFromAudnexus').mockResolvedValue(null);
    vi.spyOn(service as any, 'scrapeAudibleDetails').mockRejectedValue(new Error('boom'));

    const result = await service.getAudiobookDetails('B000TEST');

    expect(result).toBeNull();
  });

  it('writes debug HTML in development mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    axiosMock.get.mockRejectedValueOnce({ response: { status: 404 }, message: 'Not found' });
    clientMock.get.mockResolvedValueOnce({
      data: '<div class="product-top-section"><h1 class="bc-heading">Dev Book</h1></div>',
    });

    const service = new AudibleService();
    const details = await service.getAudiobookDetails('B000DEV');

    expect(details?.title).toBe('Dev Book');

    process.env.NODE_ENV = originalEnv;
  });

  it('parses JSON-LD author and narrator arrays', async () => {
    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    axiosMock.get.mockRejectedValueOnce({ response: { status: 404 }, message: 'Not found' });

    const html = `
      <script type="application/ld+json">
        {
          "@type": "Product",
          "name": "Array Book",
          "author": [{"name": "Author One"}, {"name": "Author Two"}],
          "readBy": [{"name": "Narrator One"}, {"name": "Narrator Two"}],
          "description": "A description that is long enough to be accepted in tests.",
          "image": "https://images.example.com/cover._SL200_.jpg",
          "duration": "PT1H30M"
        }
      </script>
    `;

    clientMock.get.mockResolvedValueOnce({ data: html });

    const service = new AudibleService();
    const details = await service.getAudiobookDetails('B000ARRAY');

    expect(details?.author).toBe('Author One, Author Two');
    expect(details?.narrator).toBe('Narrator One, Narrator Two');
  });

  it('falls back to author and narrator links when labels are missing', async () => {
    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    axiosMock.get.mockRejectedValueOnce({ response: { status: 404 }, message: 'Not found' });

    const html = `
      <div class="product-top-section">
        <a href="/author/Author-One">Author One</a>
        <a href="/author/See-All">See all</a>
        <a href="/narrator/Narr-One">Narrator One</a>
      </div>
    `;

    clientMock.get.mockResolvedValueOnce({ data: html });

    const service = new AudibleService();
    const details = await service.getAudiobookDetails('B000LINKS');

    expect(details?.author).toBe('Author One');
    expect(details?.narrator).toBe('Narrator One');
  });

  it('extracts descriptions from fallback paragraphs', async () => {
    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    axiosMock.get.mockRejectedValueOnce({ response: { status: 404 }, message: 'Not found' });

    const html = `
      <p>This description is intentionally long enough to satisfy the minimum length requirement for parsing.</p>
    `;

    clientMock.get.mockResolvedValueOnce({ data: html });

    const service = new AudibleService();
    const details = await service.getAudiobookDetails('B000DESC');

    expect(details?.description).toContain('intentionally long enough');
  });

  it('detects runtime from generic duration text', async () => {
    configServiceMock.getAudibleRegion.mockResolvedValue('us');
    axiosMock.get.mockRejectedValueOnce({ response: { status: 404 }, message: 'Not found' });

    const html = `
      <span>10 hr 2 min</span>
    `;

    clientMock.get.mockResolvedValueOnce({ data: html });

    const service = new AudibleService();
    const details = await service.getAudiobookDetails('B000TIME');

    expect(details?.durationMinutes).toBe(602);
  });
});
