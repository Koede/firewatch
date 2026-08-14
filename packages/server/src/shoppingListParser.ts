export interface ShoppingItem {
  name: string;
  price: number;
  url: string;
}

export interface ParseResult {
  items: ShoppingItem[];
  error?: string;
}

async function fetchUrlContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch URL: ${message}`);
  }
}

function extractPriceFromText(text: string): number | null {
  const pricePattern = /\$\s*(\d+(?:[.,]\d{2})?)/;
  const match = text.match(pricePattern);

  if (match?.[1]) {
    const priceStr = match[1].replace(',', '.');
    const price = parseFloat(priceStr);
    if (!isNaN(price)) {
      return price;
    }
  }

  return null;
}

function extractItemsFromHTML(html: string, url: string): ShoppingItem[] {
  const items: ShoppingItem[] = [];

  const scriptContent = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  const styleContent = scriptContent.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  const htmlWithoutComments = styleContent.replace(/<!--[\s\S]*?-->/g, '');

  const titleMatch = htmlWithoutComments.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) {
    const price = extractPriceFromText(htmlWithoutComments);
    if (price !== null) {
      items.push({
        name: titleMatch[1].trim(),
        price,
        url,
      });
    }
  }

  const productRegex =
    /(?:<(?:h\d|p|div|article|li)[^>]*>([^<]*(?:\$\d+[.,]\d{2})[^<]*))|(?:<[^>]*data-(?:product|item|title)[^>]*>([^<]+)<\/[^>]*>)/gi;
  let match;
  const seenNames = new Set<string>();

  while ((match = productRegex.exec(htmlWithoutComments)) !== null) {
    const text = ((match[1] ?? match[2]) ?? '').trim();
    if (text && text.length > 0 && text.length < 200) {
      const price = extractPriceFromText(text);
      if (price !== null) {
        const cleanName = text.replace(/\$\s*\d+[.,]\d{2}/g, '').trim();
        if (cleanName && !seenNames.has(cleanName)) {
          items.push({
            name: cleanName,
            price,
            url,
          });
          seenNames.add(cleanName);
        }
      }
    }
  }

  return items;
}

export async function parseShoppingUrl(url: string): Promise<ParseResult> {
  try {
    const urlObj = new URL(url);
  } catch {
    return { items: [], error: 'Invalid URL format' };
  }

  try {
    const html = await fetchUrlContent(url);
    const items = extractItemsFromHTML(html, url);

    if (items.length === 0) {
      return {
        items: [],
        error: 'No items with prices found on this page',
      };
    }

    return { items };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { items: [], error: message };
  }
}

export async function parseMultipleUrls(urls: string[]): Promise<{
  items: ShoppingItem[];
  errors: Record<string, string>;
}> {
  const allItems: ShoppingItem[] = [];
  const errors: Record<string, string> = {};

  const results = await Promise.all(urls.map((url) => parseShoppingUrl(url)));

  results.forEach((result, index) => {
    const url = urls[index];
    if (url && result.error) {
      errors[url] = result.error;
    } else if (url) {
      allItems.push(...result.items);
    }
  });

  return { items: allItems, errors };
}
