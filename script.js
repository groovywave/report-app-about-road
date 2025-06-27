// script.js

// ▼▼▼【重要】あなたのGASウェブアプリのURLに書き換えてください ▼▼▼
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbztmV9q0Q6Af2k4rBPKocEQn8pWJSb7GwlDrcmWz73k23aaVwMaDsbWiJXe3HriFG03JQ/exec';
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

// 設定
const CONFIG = {
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1秒
  REQUEST_TIMEOUT: 30000, // 30秒
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_FILE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
};

document.addEventListener('DOMContentLoaded', function () {
  // === 要素の取得 ===
  const map = L.map('map').setView([35.681236, 139.767125], 16);
  const coordsDisplay = document.getElementById('coords-display');
  const latInput = document.getElementById('latitude');
  const lngInput = document.getElementById('longitude');
  const form = document.getElementById('report-form');
  const loader = document.getElementById('loader');
  const photoInput = document.getElementById('photo');
  const imagePreview = document.getElementById('image-preview');

  // === 地図の初期化 ===
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
    attribution: "地理院タイル（GSI）",
    maxZoom: 18,
  }).addTo(map);

  function updateCenterCoords() {
    const center = map.getCenter();
    coordsDisplay.innerText = `緯度: ${center.lat.toFixed(6)} 経度: ${center.lng.toFixed(6)}`;
    latInput.value = center.lat;
    lngInput.value = center.lng;
  }

  map.on('move', updateCenterCoords);
  updateCenterCoords();

  // 現在位置の取得
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 18);
      },
      error => {
        console.warn('位置情報の取得に失敗しました:', error);
        showNotification('位置情報の取得に失敗しました。手動で位置を調整してください。', 'warning');
      }
    );
  }

  // === 写真プレビューと検証 ===
  photoInput.addEventListener('change', function () {
    if (this.files && this.files[0]) {
      const file = this.files[0];

      // ファイルサイズチェック
      if (file.size > CONFIG.MAX_FILE_SIZE) {
        showNotification('ファイルサイズが大きすぎます。5MB以下のファイルを選択してください。', 'error');
        this.value = '';
        imagePreview.style.display = 'none';
        return;
      }

      // ファイル形式チェック
      if (!CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
        showNotification('対応していないファイル形式です。JPEG、PNG、GIF、WebPファイルを選択してください。', 'error');
        this.value = '';
        imagePreview.style.display = 'none';
        return;
      }

      const reader = new FileReader();
      reader.onload = e => {
        imagePreview.src = e.target.result;
        imagePreview.style.display = 'block';
      }
      reader.onerror = () => {
        showNotification('ファイルの読み込みに失敗しました。', 'error');
        imagePreview.style.display = 'none';
      }
      reader.readAsDataURL(file);
    }
  });

  // === フォーム送信処理 ===
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // 二重送信防止
    if (loader.classList.contains('sending')) {
      return;
    }

    handleFormSubmission();
  });

  /**
   * フォーム送信の処理
   */
  async function handleFormSubmission() {
    try {
      // 送信状態の設定
      setSubmissionState(true);

      // フォームデータの検証
      const validationResult = validateFormData();
      if (!validationResult.isValid) {
        throw new Error(validationResult.message);
      }

      // 写真データの処理
      const photoData = await processPhotoData();

      // データ送信（リトライ機能付き）
      const result = await sendDataWithRetry(photoData.data, photoData.mimeType);

      // 成功処理
      handleSubmissionSuccess(result);

    } catch (error) {
      // エラー処理
      handleSubmissionError(error);
    } finally {
      // 送信状態の解除
      setSubmissionState(false);
    }
  }

  /**
   * フォームデータの検証
   */
  function validateFormData() {
    const formData = new FormData(form);

    // デバッグ用：実際の値を確認
    console.log('緯度の値:', formData.get('latitude'));
    console.log('経度の値:', formData.get('longitude'));
    console.log('通報種別の値:', formData.get('type'));

    // 必須フィールドのチェック
    const requiredFields = [
      { name: 'latitude', label: '緯度' },
      { name: 'longitude', label: '経度' },
      { name: 'type', label: '通報種別' }
    ];

    for (const field of requiredFields) {
      const value = formData.get(field.name);
      if (!value || value.trim() === '') {
        return {
          isValid: false,
          message: `${field.label}が入力されていません。`
        };
      }
    }

    // 座標の妥当性チェック
    const lat = parseFloat(formData.get('latitude'));
    const lng = parseFloat(formData.get('longitude'));

    if (isNaN(lat) || lat < -90 || lat > 90) {
      return {
        isValid: false,
        message: '緯度の値が正しくありません。'
      };
    }

    if (isNaN(lng) || lng < -180 || lng > 180) {
      return {
        isValid: false,
        message: '経度の値が正しくありません。'
      };
    }

    return { isValid: true };
  }

  /**
   * 写真データの処理
   */
  function processPhotoData() {
    return new Promise((resolve, reject) => {
      const file = photoInput.files[0];

      if (!file) {
        resolve({ data: null, mimeType: null });
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve({
        data: reader.result,
        mimeType: file.type
      });
      reader.onerror = () => reject(new Error('写真の読み込みに失敗しました。'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * データ送信（リトライ機能付き）
   */
  async function sendDataWithRetry(photoData, photoMimeType, attempt = 1) {
    try {
      const formData = new FormData(form);
      const payload = {
        latitude: formData.get('latitude'),
        longitude: formData.get('longitude'),
        type: formData.get('type'),
        roadType: formData.get('roadType'),
        details: formData.get('details'),
        name: formData.get('name'),
        contact: formData.get('contact'),
        photoData: photoData,
        photoMimeType: photoMimeType,
        timestamp: new Date().toISOString()
      };

      // タイムアウト付きfetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

      const response = await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'text/plain',
        },
        mode: 'cors',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // レスポンスの検証
      if (!response.ok) {
        throw new Error(`サーバーエラー: ${response.status} ${response.statusText}`);
      }

      // JSONレスポンスの解析
      let data;
      try {
        const responseText = await response.text();
        data = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error('サーバーからの応答を解析できませんでした。');
      }

      // 成功判定
      if (data.status === 'success') {
        return data;
      } else {
        throw new Error(data.message || 'サーバーでエラーが発生しました。');
      }

    } catch (error) {
      console.error(`送信試行 ${attempt} 失敗:`, error);

      // リトライ判定
      if (attempt < CONFIG.MAX_RETRY_ATTEMPTS && shouldRetry(error)) {
        showNotification(`送信に失敗しました。${CONFIG.RETRY_DELAY / 1000}秒後に再試行します... (${attempt}/${CONFIG.MAX_RETRY_ATTEMPTS})`, 'warning');

        await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
        return sendDataWithRetry(photoData, photoMimeType, attempt + 1);
      }

      // 最終的な失敗
      throw error;
    }
  }

  /**
   * リトライすべきエラーかどうかの判定
   */
  function shouldRetry(error) {
    // ネットワークエラーやタイムアウトの場合はリトライ
    return error.name === 'AbortError' ||
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('timeout');
  }

  /**
   * 送信成功時の処理
   */
  function handleSubmissionSuccess(result) {
    showNotification('通報を受け付けました。ご協力ありがとうございます。', 'success');

    // フォームのリセット
    form.reset();
    imagePreview.style.display = 'none';

    // 地図の中心座標を更新
    updateCenterCoords();

    console.log('送信成功:', result);
  }

  /**
   * 送信エラー時の処理
   */
  function handleSubmissionError(error) {
    console.error('送信エラー:', error);

    let errorMessage = '送信に失敗しました。';

    // エラーの種類に応じたメッセージ
    if (error.name === 'AbortError') {
      errorMessage = '送信がタイムアウトしました。ネットワーク接続を確認してください。';
    } else if (error.message.includes('CORS')) {
      errorMessage = 'サーバーとの通信に問題があります。しばらく時間をおいて再度お試しください。';
    } else if (error.message) {
      errorMessage = `エラー: ${error.message}`;
    }

    showNotification(errorMessage, 'error');
  }

  /**
   * 送信状態の設定
   */
  function setSubmissionState(isSending) {
    if (isSending) {
      loader.classList.remove('hidden');
      loader.classList.add('sending');

      // フォーム要素を無効化
      const formElements = form.querySelectorAll('input, select, textarea, button');
      formElements.forEach(element => element.disabled = true);

    } else {
      loader.classList.add('hidden');
      loader.classList.remove('sending');

      // フォーム要素を有効化
      const formElements = form.querySelectorAll('input, select, textarea, button');
      formElements.forEach(element => element.disabled = false);
    }
  }

  /**
   * 通知メッセージの表示
   */
  function showNotification(message, type = 'info') {
    // 既存の通知を削除
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    // 新しい通知を作成
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // スタイルを設定
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 4px;
      color: white;
      font-weight: bold;
      z-index: 10000;
      max-width: 300px;
      word-wrap: break-word;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    `;

    // タイプ別の色設定
    switch (type) {
      case 'success':
        notification.style.backgroundColor = '#10b981';
        break;
      case 'error':
        notification.style.backgroundColor = '#ef4444';
        break;
      case 'warning':
        notification.style.backgroundColor = '#f59e0b';
        break;
      default:
        notification.style.backgroundColor = '#3b82f6';
    }

    document.body.appendChild(notification);

    // 5秒後に自動削除
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }
});
