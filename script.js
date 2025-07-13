// script.js - 既存CONFIG設定を踏襲したCORS完全対応版

// ▼▼▼【重要】設定値を更新してください ▼▼▼
const CONFIG = {
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbx_X4rm8zYRG6wkonYcVbSDOD1vVo6e81flAu4f99FGlG_OWwvpWEgpcxrh6I2HfX595A/exec',
  LIFF_ID: '2007739464-gVVMBAQR', // 実際のLIFF IDに変更
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 2000,
  REQUEST_TIMEOUT: 30000,
  MAX_FILE_SIZE: 5 * 1024 * 1024,
  ALLOWED_FILE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  DEFAULT_LAT: 36.87,
  DEFAULT_LNG: 140.01,
  MAP_ZOOM: 15
};
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

// グローバル変数
let map = null;
let currentPosition = { lat: CONFIG.DEFAULT_LAT, lng: CONFIG.DEFAULT_LNG };
let currentPhoto = { data: null, mimeType: null };
let videoStream = null;
let lineAccessToken = null;
let lineUserId = null;

// ===== CORS対応データ送信関数 =====

function sendDataWithRetry(formData, attempt) {
  attempt = attempt || 1;

  return new Promise(function(resolve, reject) {
    console.log('送信試行 ' + attempt + '/' + CONFIG.MAX_RETRY_ATTEMPTS);

    // AbortControllerでタイムアウト制御
    const controller = new AbortController();
    const timeoutId = window.setTimeout(function() {
      controller.abort();
    }, CONFIG.REQUEST_TIMEOUT);

    // 現在のオリジンを取得
    const currentOrigin = window.location.origin;

    // CORS対応のfetchリクエスト
    fetch(CONFIG.GAS_WEB_APP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': currentOrigin
      },
      body: JSON.stringify({
        ...formData,
        origin: currentOrigin
      }),
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal
    })
      .then(function(response) {
        window.clearTimeout(timeoutId);

        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);

        if (!response.ok) {
          throw new Error('HTTP Error: ' + response.status + ' ' + response.statusText);
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return response.json();
        } else {
          return response.text().then(function(text) {
            try {
              return JSON.parse(text);
            } catch (e) {
              throw new Error('Invalid JSON response: ' + text);
            }
          });
        }
      })
      .then(function(data) {
        console.log('Response data:', data);

        if (data.status === 'success') {
          resolve(data);
        } else {
          throw new Error(data.message || 'Server returned error status');
        }
      })
      .catch(function(error) {
        window.clearTimeout(timeoutId);

        console.error('Fetch error (attempt ' + attempt + '):', error);

        // リトライ判定
        if (attempt < CONFIG.MAX_RETRY_ATTEMPTS && shouldRetry(error)) {
          const delay = CONFIG.RETRY_DELAY * attempt; // 指数バックオフ
          showNotification('送信に失敗しました。' + (delay / 1000) + '秒後に再試行します... (' + attempt + '/' + CONFIG.MAX_RETRY_ATTEMPTS + ')', 'warning');

          window.setTimeout(function() {
            sendDataWithRetry(formData, attempt + 1)
              .then(resolve)
              .catch(reject);
          }, delay);
        } else {
          reject(new Error('送信に失敗しました: ' + error.message));
        }
      });
  });
}

function shouldRetry(error) {
  const retryableErrors = [
    'AbortError',
    'TypeError',
    'NetworkError',
    'fetch',
    'network',
    'timeout',
    'CORS',
    'Failed to fetch'
  ];

  return retryableErrors.some(function(errorType) {
    return error.name === errorType || error.message.toLowerCase().includes(errorType.toLowerCase());
  });
}

// ===== 接続テスト関数 =====

function testConnection() {
  console.log('GAS接続テスト開始');
  showNotification('接続テストを実行中...', 'info');

  const currentOrigin = window.location.origin;

  fetch(CONFIG.GAS_WEB_APP_URL + '?test=1', {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Origin': currentOrigin
    },
    mode: 'cors',
    credentials: 'omit'
  })
    .then(function(response) {
      console.log('Test response status:', response.status);

      if (response.ok) {
        return response.json();
      } else {
        throw new Error('Test failed: ' + response.status);
      }
    })
    .then(function(data) {
      console.log('Test response data:', data);

      // 設定状況の表示
      if (data.config) {
        let configMessage = 'GAS設定状況:\n';
        configMessage += '✅ スプレッドシート: ' + (data.config.hasSpreadsheetId ? '設定済み' : '未設定') + '\n';
        configMessage += '✅ LINEトークン: ' + (data.config.hasLineToken ? '設定済み' : '未設定') + '\n';
        configMessage += '✅ Driveフォルダ: ' + (data.config.hasDriveFolder ? '設定済み' : '未設定');

        console.log(configMessage);
      }

      showNotification('GAS接続テスト成功', 'success');
    })
    .catch(function(error) {
      console.error('Test connection error:', error);
      showNotification('GAS接続テスト失敗: ' + error.message, 'error');
    });
}

// ===== フォーム送信処理（CORS対応版） =====

function submitForm(event) {
  if (event) event.preventDefault();

  if (!validateForm()) {
    return;
  }

  setSubmissionState(true);

  // フォームデータ収集
  let selectedType = '';
  const typeInputs = document.querySelectorAll('input[name="type"]');
  for (let i = 0; i < typeInputs.length; i++) {
    if (typeInputs[i].checked) {
      selectedType = typeInputs[i].value;
      break;
    }
  }

  const details = document.getElementById('details').value.trim();

  const formData = {
    latitude: currentPosition.lat,
    longitude: currentPosition.lng,
    type: selectedType,
    details: details,
    photoData: currentPhoto.data,
    photoMimeType: currentPhoto.mimeType,
    accessToken: lineAccessToken,
    userId: lineUserId,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    referrer: document.referrer
  };

  console.log('Sending form data:', {
    ...formData,
    photoData: formData.photoData ? '[IMAGE_DATA]' : null
  });

  // データ送信
  sendDataWithRetry(formData)
    .then(function(result) {
      console.log('送信成功:', result);
      showNotification('通報を受け付けました。ご協力ありがとうございます。', 'success');

      if (result.lineNotified) {
        showNotification('LINEに詳細情報を送信しました', 'info');
      }

      if (result.spreadsheetUpdated) {
        console.log('スプレッドシート更新成功');
      }

      if (result.imageUploaded) {
        console.log('画像アップロード成功');
      }

      // フォームリセット
      resetForm();
    })
    .catch(function(error) {
      console.error('送信エラー:', error);
      showNotification('送信に失敗しました: ' + error.message, 'error');
    })
    .finally(function() {
      setSubmissionState(false);
    });
}

// ===== その他の関数（既存のまま） =====

function showNotification(message, type) {
  type = type || 'info';

  const existing = document.querySelector('.notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = 'notification notification-' + type;
  notification.textContent = message;

  const colors = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6'
  };

  notification.style.cssText =
    'position: fixed; top: 20px; right: 20px; padding: 12px 20px;' +
    'border-radius: 8px; color: white; font-weight: 600; z-index: 10000;' +
    'max-width: 300px; word-wrap: break-word; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);' +
    'background-color: ' + (colors[type] || colors.info) + ';' +
    'animation: slideIn 0.3s ease;';

  document.body.appendChild(notification);

  const timeoutId = window.setTimeout(function() {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 5000);

  notification.addEventListener('click', function() {
    window.clearTimeout(timeoutId);
    notification.remove();
  });
}

function updateLineStatus(type, message) {
  const statusElement = document.getElementById('line-status');
  const textElement = document.getElementById('line-status-text');

  if (!statusElement || !textElement) return;

  statusElement.className = 'line-status ' + type;
  textElement.textContent = message;
  statusElement.classList.remove('hidden');

  if (type === 'success') {
    window.setTimeout(function() {
      statusElement.classList.add('hidden');
    }, 5000);
  }
}

function updateCoordinatesDisplay() {
  const coordsDisplay = document.getElementById('coords-display');
  if (coordsDisplay) {
    coordsDisplay.textContent = '緯度: ' + currentPosition.lat.toFixed(6) + ', 経度: ' + currentPosition.lng.toFixed(6);
  }

  const latInput = document.getElementById('latitude');
  const lngInput = document.getElementById('longitude');
  if (latInput) latInput.value = currentPosition.lat;
  if (lngInput) lngInput.value = currentPosition.lng;
}

function updatePhoto(data, mimeType) {
  currentPhoto.data = data;
  currentPhoto.mimeType = mimeType;

  const preview = document.getElementById('image-preview');
  if (preview) {
    if (data && mimeType) {
      preview.src = data;
      preview.style.display = 'block';
    } else {
      preview.src = '#';
      preview.style.display = 'none';
    }
  }

  const fileInput = document.getElementById('photo');
  if (fileInput) fileInput.value = '';
}

function initializeLiff() {
  if (!CONFIG.LIFF_ID || CONFIG.LIFF_ID === '2007739464-gVVMBAQR') {
    console.warn('LIFF IDが設定されていません');
    updateLineStatus('warning', 'LIFF設定が必要です - 実際のLIFF IDを設定してください');
    return;
  }

  try {
    liff.init({ liffId: CONFIG.LIFF_ID })
      .then(function() {
        console.log('LIFF初期化成功');

        if (liff.isLoggedIn()) {
          lineAccessToken = liff.getAccessToken();
          return liff.getProfile();
        } else {
          throw new Error('LINEにログインしていません');
        }
      })
      .then(function(profile) {
        lineUserId = profile.userId;

        const accessTokenInput = document.getElementById('accessToken');
        const userIdInput = document.getElementById('userId');
        if (accessTokenInput) accessTokenInput.value = lineAccessToken;
        if (userIdInput) userIdInput.value = lineUserId;

        updateLineStatus('success', 'LINE連携済み: ' + profile.displayName);
        console.log('LINEユーザー情報取得成功:', profile);
      })
      .catch(function(error) {
        console.error('LIFF初期化エラー:', error);
        updateLineStatus('error', 'LINE連携エラー: ' + error.message);

        try {
          liff.login();
        } catch (loginError) {
          console.error('自動ログイン失敗:', loginError);
        }
      });
  } catch (error) {
    console.error('LIFF初期化例外:', error);
    updateLineStatus('error', 'LIFF初期化に失敗しました');
  }
}

function initializeMap() {
  try {
    const mapElement = document.getElementById('map');
    if (!mapElement) {
      console.error('地図要素が見つかりません');
      return;
    }

    map = L.map('map').setView([currentPosition.lat, currentPosition.lng], CONFIG.MAP_ZOOM);

    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
      attribution: '地理院タイル（GSI）',
      maxZoom: 18
    }).addTo(map);

    map.on('moveend', function() {
      const center = map.getCenter();
      currentPosition = {
        lat: center.lat,
        lng: center.lng
      };
      updateCoordinatesDisplay();
    });

    updateCoordinatesDisplay();
    console.log('地図初期化完了');

  } catch (error) {
    console.error('地図初期化エラー:', error);
    showNotification('地図の初期化に失敗しました', 'error');
  }
}

function getCurrentLocation() {
  if (!navigator.geolocation) {
    console.warn('位置情報がサポートされていません');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function(position) {
      currentPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      if (map) {
        map.setView([currentPosition.lat, currentPosition.lng], CONFIG.MAP_ZOOM);
        updateCoordinatesDisplay();
      }

      console.log('現在位置取得成功:', currentPosition);
    },
    function(error) {
      console.warn('現在位置取得エラー:', error.message);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000
    }
  );
}

function validateForm() {
  const typeInputs = document.querySelectorAll('input[name="type"]');
  let typeSelected = false;

  for (let i = 0; i < typeInputs.length; i++) {
    if (typeInputs[i].checked) {
      typeSelected = true;
      break;
    }
  }

  if (!typeSelected) {
    showNotification('通報種別を選択してください', 'warning');
    return false;
  }

  if (!currentPosition.lat || !currentPosition.lng) {
    showNotification('位置情報が取得できていません', 'warning');
    return false;
  }

  return true;
}

function setSubmissionState(isSending) {
  const loader = document.getElementById('loader');
  const form = document.getElementById('report-form');

  if (loader) {
    if (isSending) {
      loader.classList.remove('hidden');
    } else {
      loader.classList.add('hidden');
    }
  }

  if (form) {
    const formElements = form.querySelectorAll('input, select, textarea, button');
    for (let i = 0; i < formElements.length; i++) {
      formElements[i].disabled = isSending;
    }
  }
}

function resetForm() {
  const typeInputs = document.querySelectorAll('input[name="type"]');
  typeInputs.forEach(function(input) {
    input.checked = false;
  });

  const details = document.getElementById('details');
  if (details) details.value = '';

  updatePhoto(null, null);
}

function setupEventListeners() {
  const form = document.getElementById('report-form');
  if (form) {
    form.addEventListener('submit', submitForm);
  }

  const submitButton = document.getElementById('btn-submit');
  if (submitButton) {
    submitButton.addEventListener('click', submitForm);
  }

  // 接続テストボタン（デバッグ用）
  const testButton = document.getElementById('test-connection');
  if (testButton) {
    testButton.addEventListener('click', testConnection);
  }
}

function initializeApp() {
  console.log('アプリケーション初期化開始');

  try {
    initializeLiff();

    window.setTimeout(function() {
      initializeMap();
      getCurrentLocation();
    }, 100);

    setupEventListeners();

    // 接続テスト（開発時のみ）
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      window.setTimeout(testConnection, 1000);
    }

    console.log('アプリケーション初期化完了');

  } catch (error) {
    console.error('初期化エラー:', error);
    showNotification('初期化に失敗しました', 'error');
  }
}

document.addEventListener('DOMContentLoaded', function() {
  console.log('ページ読み込み完了');
  window.setTimeout(initializeApp, 200);
});

window.addEventListener('error', function(event) {
  console.error('グローバルエラー:', event.error);
});

window.addEventListener('unhandledrejection', function(event) {
  console.error('未処理のPromise拒否:', event.reason);
});
