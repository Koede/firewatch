import { useState } from 'react';
import '../styles/ShoppingList.css';

export interface ShoppingItem {
  name: string;
  price: number;
  url: string;
}

export function ShoppingList() {
  const [urlInput, setUrlInput] = useState('');
  const [urls, setUrls] = useState<string[]>([]);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [totalSpent, setTotalSpent] = useState(0);

  const addUrl = () => {
    if (!urlInput.trim()) return;

    try {
      new URL(urlInput);
      if (!urls.includes(urlInput)) {
        setUrls([...urls, urlInput]);
        setUrlInput('');
      } else {
        alert('URL already added');
      }
    } catch {
      alert('Please enter a valid URL');
    }
  };

  const removeUrl = (url: string) => {
    setUrls(urls.filter((u) => u !== url));
  };

  const fetchItemsFromUrls = async () => {
    if (urls.length === 0) return;

    setLoading(true);
    setErrors({});

    try {
      const response = await fetch('/api/shopping-list/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(`Error: ${errorData.error || 'Failed to parse URLs'}`);
        setLoading(false);
        return;
      }

      const data = await response.json();
      setItems(data.items || []);
      setErrors(data.errors || {});

      const total = (data.items || []).reduce((sum: number, item: ShoppingItem) => sum + item.price, 0);
      setTotalSpent(total);
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to fetch items'}`);
    } finally {
      setLoading(false);
    }
  };

  const clearItems = () => {
    setItems([]);
    setUrls([]);
    setErrors({});
    setTotalSpent(0);
    setUrlInput('');
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_item, i) => i !== index);
    setItems(newItems);
    setTotalSpent(newItems.reduce((sum, item) => sum + item.price, 0));
  };

  return (
    <div className="shopping-list">
      <div className="shopping-list-header">
        <h2>Shopping List</h2>
      </div>

      <div className="shopping-list-container">
        <div className="url-input-section">
          <h3>Add Product Links</h3>
          <div className="url-input-group">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addUrl()}
              placeholder="https://example.com/product"
              className="url-input"
            />
            <button onClick={addUrl} className="button add-url-button">
              Add URL
            </button>
          </div>

          {urls.length > 0 && (
            <div className="urls-list">
              <h4>Added URLs ({urls.length}):</h4>
              <ul>
                {urls.map((url) => (
                  <li key={url} className="url-item">
                    <span className="url-text">{url}</span>
                    <button
                      onClick={() => removeUrl(url)}
                      className="icon-button remove-button"
                      aria-label="Remove URL"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>

              <div className="url-actions">
                <button
                  onClick={fetchItemsFromUrls}
                  className="button fetch-button"
                  disabled={loading}
                >
                  {loading ? 'Parsing...' : 'Parse URLs'}
                </button>
              </div>
            </div>
          )}

          {Object.entries(errors).length > 0 && (
            <div className="errors-section">
              <h4>Errors:</h4>
              {Object.entries(errors).map(([url, error]) => (
                <div key={url} className="error-item">
                  <strong>{url}</strong>
                  <p>{error}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="items-section">
            <div className="items-header">
              <h3>Items ({items.length})</h3>
              <div className="total-spent">
                <span>Total: </span>
                <span className="total-amount">${totalSpent.toFixed(2)}</span>
              </div>
            </div>

            <div className="items-list">
              {items.map((item, index) => (
                <div key={`${item.url}-${index}`} className="item-card">
                  <div className="item-info">
                    <h4 className="item-name">{item.name}</h4>
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="item-url">
                      View on site
                    </a>
                  </div>
                  <div className="item-price-section">
                    <span className="item-price">${item.price.toFixed(2)}</span>
                    <button
                      onClick={() => removeItem(index)}
                      className="icon-button remove-item-button"
                      aria-label="Remove item"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={clearItems} className="button clear-button">
              Clear All
            </button>
          </div>
        )}

        {items.length === 0 && urls.length === 0 && (
          <div className="empty-state">
            <p>Add product URLs above and click "Parse URLs" to extract items and prices.</p>
          </div>
        )}
      </div>
    </div>
  );
}
