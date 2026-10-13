document.addEventListener('DOMContentLoaded', () => {
  const shortenForm = document.getElementById('shorten-form');
  const urlInput = document.getElementById('url-input');
  const aliasInput = document.getElementById('alias-input');
  const aliasPrefix = document.getElementById('alias-prefix');
  const submitBtn = document.getElementById('submit-btn');
  const formError = document.getElementById('form-error');
  const resultBox = document.getElementById('result-box');
  const resultUrl = document.getElementById('result-url');
  const resultOriginal = document.getElementById('result-original');
  const copyBtn = document.getElementById('copy-btn');
  const historyList = document.getElementById('history-list');
  const historyEmpty = document.getElementById('history-empty');
  const historyCount = document.getElementById('history-count');
  const noticeBanner = document.getElementById('notice-banner');
  const currentYearSpan = document.getElementById('current-year');

  let currentShortUrl = '';

  // Set dynamic alias prefix based on current host
  if (aliasPrefix) {
    aliasPrefix.textContent = window.location.host + '/';
  }

  // Set current year in footer
  if (currentYearSpan) {
    currentYearSpan.textContent = new Date().getFullYear();
  }

  // Check URL parameters for redirect errors
  const params = new URLSearchParams(window.location.search);
  if (params.get('error') === 'not_found') {
    showNotice('The requested short link was not found or has been removed.', true);
    // Clean up query string without reload
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  function showNotice(message, isError = false) {
    if (!noticeBanner) return;
    noticeBanner.textContent = message;
    noticeBanner.className = 'notice-banner' + (isError ? ' notice-error' : '');
    noticeBanner.classList.remove('hidden');
  }

  function clearError() {
    formError.textContent = '';
    formError.classList.add('hidden');
  }

  function showError(msg) {
    formError.textContent = msg;
    formError.classList.remove('hidden');
  }

  function validateUrl(input) {
    let trimmed = (input || '').trim();
    if (!trimmed) {
      return { valid: false, error: 'Please enter a URL' };
    }

    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = 'https://' + trimmed;
    }

    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
        return { valid: false, error: 'Please enter a valid web URL' };
      }
      return { valid: true, url: trimmed };
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  function formatDate(dateString) {
    if (!dateString) return '';
    try {
      const normalized = dateString.endsWith('Z') ? dateString : dateString.replace(' ', 'T') + 'Z';
      const date = new Date(normalized);
      if (isNaN(date.getTime())) return dateString;

      const diffSecs = Math.floor((Date.now() - date.getTime()) / 1000);
      if (diffSecs < 60) return 'just now';

      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}m ago`;

      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;

      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  }

  async function copyToClipboard(text, btn) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      const prev = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = prev;
        btn.classList.remove('copied');
      }, 1600);
    } catch (err) {
      console.error('Copy failed:', err);
      btn.textContent = 'Failed';
      setTimeout(() => {
        btn.textContent = 'Copy';
      }, 1600);
    }
  }

  function displayResult(shortUrl, originalUrl) {
    currentShortUrl = shortUrl;
    resultUrl.textContent = shortUrl;
    resultUrl.href = shortUrl;
    resultOriginal.textContent = originalUrl;
    resultBox.classList.remove('hidden');
  }

  function renderHistory(urls) {
    historyList.innerHTML = '';

    if (!urls || urls.length === 0) {
      historyEmpty.classList.remove('hidden');
      historyCount.textContent = '0 links';
      return;
    }

    historyEmpty.classList.add('hidden');
    historyCount.textContent = `${urls.length} ${urls.length === 1 ? 'link' : 'links'}`;

    urls.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'history-item';
      itemEl.dataset.code = item.short_code;

      const mainDiv = document.createElement('div');
      mainDiv.className = 'history-main';

      const shortLink = document.createElement('a');
      shortLink.className = 'history-short-url';
      shortLink.href = item.short_url;
      shortLink.target = '_blank';
      shortLink.rel = 'noopener noreferrer';
      shortLink.textContent = item.short_url;

      const originalSpan = document.createElement('span');
      originalSpan.className = 'history-original-url';
      originalSpan.textContent = item.original_url;
      originalSpan.title = item.original_url;

      mainDiv.appendChild(shortLink);
      mainDiv.appendChild(originalSpan);

      const metaDiv = document.createElement('div');
      metaDiv.className = 'history-meta';

      const clicksSpan = document.createElement('span');
      clicksSpan.className = 'history-clicks';
      clicksSpan.textContent = `${item.clicks || 0} ${item.clicks === 1 ? 'click' : 'clicks'}`;

      const dateSpan = document.createElement('span');
      dateSpan.className = 'history-date';
      dateSpan.textContent = formatDate(item.created_at);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-delete';
      deleteBtn.textContent = 'Delete';
      deleteBtn.type = 'button';
      deleteBtn.setAttribute('aria-label', `Delete ${item.short_code}`);

      deleteBtn.addEventListener('click', async () => {
        deleteBtn.disabled = true;
        try {
          const res = await fetch(`/api/urls/${item.short_code}`, {
            method: 'DELETE'
          });
          if (res.ok) {
            if (currentShortUrl === item.short_url) {
              resultBox.classList.add('hidden');
              currentShortUrl = '';
            }
            loadHistory();
          } else {
            const data = await res.json().catch(() => ({}));
            alert(data.error || 'Failed to delete URL');
            deleteBtn.disabled = false;
          }
        } catch (err) {
          console.error('Delete error:', err);
          alert('Network error while deleting URL');
          deleteBtn.disabled = false;
        }
      });

      metaDiv.appendChild(clicksSpan);
      metaDiv.appendChild(dateSpan);
      metaDiv.appendChild(deleteBtn);

      itemEl.appendChild(mainDiv);
      itemEl.appendChild(metaDiv);

      historyList.appendChild(itemEl);
    });
  }

  async function loadHistory() {
    try {
      const res = await fetch('/api/urls');
      if (!res.ok) throw new Error('Failed to load history');
      const data = await res.json();
      renderHistory(data);
    } catch (err) {
      console.error('Error loading history:', err);
    }
  }

  // Form submit handler
  shortenForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const inputVal = urlInput.value;
    const validation = validateUrl(inputVal);

    if (!validation.valid) {
      showError(validation.error);
      urlInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Shortening...';

    try {
      const body = { url: validation.url };
      const alias = aliasInput ? aliasInput.value.trim() : '';
      if (alias) {
        body.customCode = alias;
      }

      const res = await fetch('/api/shorten', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      let data = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json().catch(() => ({}));
      } else {
        const text = await res.text().catch(() => '');
        data = { error: text || `Server error (${res.status})` };
      }

      if (!res.ok) {
        showError(data.error || `Failed to shorten URL (Status ${res.status})`);
      } else {
        displayResult(data.shortUrl, data.originalUrl);
        urlInput.value = '';
        if (aliasInput) aliasInput.value = '';
        loadHistory();
      }
    } catch (err) {
      console.error('Shorten error:', err);
      showError(err.message || 'Network error. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Shorten';
    }
  });

  // Clear error on input
  urlInput.addEventListener('input', () => {
    if (!formError.classList.contains('hidden')) {
      clearError();
    }
  });

  // Copy button click handler
  copyBtn.addEventListener('click', () => {
    if (currentShortUrl) {
      copyToClipboard(currentShortUrl, copyBtn);
    }
  });

  // Keyboard shortcut: Enter to submit (handles any edge cases)
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      shortenForm.requestSubmit();
    }
  });

  // Initial load
  loadHistory();
});
