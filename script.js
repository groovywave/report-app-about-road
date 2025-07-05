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

let currentPhoto = {
  data: null,
  mimeType: null,
};

let videoStream = null;

document.addEventListener('DOMContentLoaded', function() {
  // === 要素の取得 ===
  const map = L.map('map').setView([36.871, 140.016], 16);
  const coordsDisplay = document.getElementById('coords-display');
  const latInput = document.getElementById('latitude');
  const lngInput = document.getElementById('longitude');
  const form = document.getElementById('report-form');
  const loader = document.getElementById('loader');
  const photoInput = document.getElementById('photo');
  const imagePreview = document.getElementById('image-preview');

  const startCameraButton = document.getElementById('start-camera-btn');
  const cameraModal = document.getElementById('camera-modal');
  const videoWrapper = document.getElementById('video-wrapper');
  const videoElement = document.getElementById('camera-stream');
  const cameraErrorView = document.getElementById('camera-error-view');
  const cameraErrorText = document.getElementById('camera-error-text');
  const retryCameraButton = document.getElementById('retry-camera-btn');
  const canvasElement = document.getElementById('camera-canvas');
  const captureButton = document.getElementById('capture-btn');
  const cancelButton = document.getElementById('cancel-camera-btn');

  if (!startCameraButton) {
    console.error('カメラで撮影ボタンは機能していません。');
  }

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
    console.log("updateCenterCoords called. Setting latitude:", latInput.value, "longitude:", lngInput.value);
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

  // ▼▼▼【追加】写真データとプレビューを更新する共通関数 ▼▼▼
  /**
   * 写真データとプレビューを更新する
   * @param {string | null} data - Base64データURL
   * @param {string | null} mimeType - MIMEタイプ
   */
  function updatePhoto(data, mimeType) {
    if (data && mimeType) {
      currentPhoto.data = data;
      currentPhoto.mimeType = mimeType;
      imagePreview.src = data;
      imagePreview.style.display = 'block'; // プレビューを表示
      // ファイル選択の値をリセットし、カメラ撮影後に再度ファイル選択できるようにする
      photoInput.value = '';
    } else {
      // データがない場合はリセット
      currentPhoto.data = null;
      currentPhoto.mimeType = null;
      imagePreview.src = '#';
      imagePreview.style.display = 'none'; // プレビューを非表示
      photoInput.value = '';
    }
  }

  // === 写真プレビューと検証 ===
  photoInput.addEventListener('change', function() {
    if (this.files && this.files[0]) {
      const file = this.files[0];

      // ファイルサイズチェック
      if (file.size > CONFIG.MAX_FILE_SIZE) {
        showNotification('ファイルサイズが大きすぎます。5MB以下のファイルを選択してください。', 'error');
        updatePhoto(null, null);
        return;
      }

      // ファイル形式チェック
      if (!CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
        showNotification('対応していないファイル形式です。JPEG、PNG、GIF、WebPファイルを選択してください。', 'error');
        updatePhoto(null, null);
        return;
      }

      const reader = new FileReader();
      reader.onload = e => {
        updatePhoto(e.target.result, file.type);
      }
      reader.onerror = () => {
        showNotification('ファイルの読み込みに失敗しました。', 'error');
        updatePhoto(null, null);
      }
      reader.readAsDataURL(file);
      console.log(reader.readAsDataURL(file));
    }
  });

  // === カメラ撮影のロジック ===

  // カメラ起動処理を独立した関数にまとめる
  async function startCamera() {
    console.log('カメラ起動処理を開始');

    // カメラ起動を試みる前に、ビューを正常状態にセット
    videoWrapper.classList.remove('hidden');
    cameraErrorView.classList.add('hidden');
    captureButton.classList.remove('hidden');

    // 環境チェック
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('MediaDevices API not supported');
      handleCameraError(new Error('このブラウザではカメラAPIがサポートされていません'));
      return;
    }

    // HTTPS接続チェック
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      console.error('HTTPS connection required');
      handleCameraError(new Error('カメラアクセスにはHTTPS接続が必要です'));
      return;
    }

    try {
      console.log('カメラ権限を要求中...');

      // 改良されたカメラ制約設定
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' }, // 背面カメラを優先
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30, min: 15 }
        },
        audio: false
      };

      console.log('getUserMedia制約:', constraints);

      videoStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('カメラストリーム取得成功:', videoStream);

      videoElement.srcObject = videoStream;

      // iOS Safari対応
      videoElement.setAttribute('autoplay', '');
      videoElement.setAttribute('muted', '');
      videoElement.setAttribute('playsinline', '');

      // ビデオの再生を確実にする
      try {
        await videoElement.play();
        console.log('ビデオ再生開始');
      } catch (playError) {
        console.warn('ビデオ自動再生失敗:', playError);
        // 自動再生に失敗した場合でも続行
      }

      // 成功したらモーダルを開く
      cameraModal.classList.remove('hidden');
      showNotification('カメラが起動しました', 'success');

      console.log('カメラ起動成功');
    } catch (err) {
      console.error('カメラ起動エラー:', err);
      // エラーが発生したらエラー処理関数を呼ぶ
      handleCameraError(err);
    }
  }

  // カメラ起動エラーを処理する専用の関数
  function handleCameraError(err) {
    console.error('カメラの起動に失敗:', err);

    // エラーの種類に応じてユーザーへのメッセージを変える
    let message = 'カメラの起動に失敗しました。';
    let guidance = '';

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      message = 'カメラへのアクセスが拒否されました。';
      guidance = `
        <strong>解決方法:</strong><br>
        1. ブラウザのアドレスバーにあるカメラアイコンをクリック<br>
        2. 「カメラ」を「許可」に変更<br>
        3. ページを再読み込み<br><br>
        <strong>または設定から:</strong><br>
        • Android: 設定 → アプリ → ブラウザ → 権限 → カメラ → 許可<br>
        • iPhone: 設定 → Safari → カメラ → 許可
      `;
    } else if (err.name === 'NotFoundError' || err.name === 'DeviceNotFoundError') {
      message = '利用可能なカメラが見つかりませんでした。';
      guidance = 'デバイスにカメラが接続されているか確認してください。';
    } else if (err.name === 'NotReadableError') {
      message = 'カメラが他のアプリケーションで使用中です。';
      guidance = '他のアプリ（Zoom、Skype、カメラアプリ等）を終了してから再試行してください。';
    } else if (err.name === 'OverconstrainedError') {
      message = 'カメラの設定に問題があります。';
      guidance = '要求されたカメラ設定がサポートされていません。';
    } else if (err.name === 'SecurityError') {
      message = 'セキュリティエラーが発生しました。';
      guidance = 'HTTPS接続が必要です。';
    } else if (err.message.includes('HTTPS')) {
      message = 'HTTPS接続が必要です。';
      guidance = 'カメラ機能を使用するには、HTTPS接続でアクセスしてください。';
    } else if (err.message.includes('サポート')) {
      message = 'このブラウザではカメラ機能がサポートされていません。';
      guidance = '最新のChrome、Safari、Firefoxをご使用ください。';
    } else {
      message = `エラーが発生しました: ${err.message}`;
      guidance = 'ページを再読み込みして再試行してください。';
    }

    // エラー用のビューを表示
    cameraErrorText.innerHTML = `
      <div style="text-align: left;">
        <p style="font-weight: bold; color: #dc3545; margin-bottom: 12px;">${message}</p>
        <div style="font-size: 14px; line-height: 1.5;">${guidance}</div>
      </div>
    `;

    videoWrapper.classList.add('hidden');
    cameraErrorView.classList.remove('hidden');
    captureButton.classList.add('hidden');

    // エラーでもモーダルは表示する
    cameraModal.classList.remove('hidden');

    // 通知も表示
    showNotification(message, 'error');
  }

  // カメラを停止し、ビューの状態をリセットする関数
  function stopCamera() {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      videoStream = null;
    }
    videoElement.srcObject = null;
    cameraModal.classList.add('hidden');

    // モーダルを閉じる際に、ビューの状態を次回のためにリセットする
    setTimeout(() => {
      videoWrapper.classList.remove('hidden');
      cameraErrorView.classList.add('hidden');
      captureButton.classList.remove('hidden');
    }, 300);
  }

  // === イベントリスナー ===

  // 「カメラで撮影」ボタンが押されたらカメラを起動
  startCameraButton.addEventListener('click', startCamera);

  // 「再試行」ボタンが押されたら、もう一度カメラを起動
  retryCameraButton.addEventListener('click', startCamera);

  // 「キャンセル」ボタンが押されたらカメラを停止
  cancelButton.addEventListener('click', stopCamera);

  // 「撮影」写真データの処理
  captureButton.addEventListener('click', () => {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    const context = canvasElement.getContext('2d');
    context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

    const mimeType = 'image/jpeg';
    const dataUrl = canvasElement.toDataURL(mimeType, 0.9);
    updatePhoto(dataUrl, mimeType);
    stopCamera();

    showNotification('写真を撮影しました。', 'success');
  });

  // === フォーム送信処理 ===
  form.addEventListener('submit', function(e) {
    e.preventDefault();

    // 二重送信防止
    if (loader.classList.contains('sending')) {
      return;
    }

    const formData = new FormData(form);
    handleFormSubmission(formData);
  });

  /**
   * フォーム送信の処理
   */
  async function handleFormSubmission(formData) {
    try {
      // 送信状態の設定
      setSubmissionState(true, '通報を送信中...');

      // フォームデータの検証
      const validationResult = validateFormData(formData);
      if (!validationResult.isValid) {
        throw new Error(validationResult.message);
      }

      // データ送信（リトライ機能付き）
      const result = await sendDataWithRetry(formData, currentPhoto.data, currentPhoto.mimeType);

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
  function validateFormData(formData) {
    // デバッグ用：実際の値を確認
    console.log('緯度の値:', formData.get('latitude'));
    console.log('経度の値:', formData.get('longitude'));
    console.log('通報種別の値:', formData.get('type'));

    // 必須フィールドのチェック
    const requiredFields = [
      { name: 'latitude', label: '場所' },
      { name: 'longitude', label: '場所' },
      { name: 'type', label: '異常の種類' }
    ];

    for (const field of requiredFields) {
      const value = formData.get(field.name);
      if (!value || value.trim() === '') {
        if (field.name.includes('itude')) {
          return { isValid: false, message: '場所が指定されていません。地図を動かして位置を合わせてください。' };
        }
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
   * データ送信（リトライ機能付き）
   */
  async function sendDataWithRetry(formData, photoData, photoMimeType, attempt = 1) {
    try {
      const payload = {
        latitude: formData.get('latitude'),
        longitude: formData.get('longitude'),
        type: formData.get('type'),
        details: formData.get('details'),
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
        return sendDataWithRetry(formData, photoData, photoMimeType, attempt + 1);
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
    updatePhoto(null, null);

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

  // ページ離脱時のクリーンアップ
  window.addEventListener('beforeunload', () => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
    }
  });
});


