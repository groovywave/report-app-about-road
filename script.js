// script.js - 最終統合版

// ▼▼▼【重要】設定値を更新してください ▼▼▼
const CONFIG = {
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbyOISecm5uFw07V1ikNJEVa-XcVmoblkzCnorQ5XsQw6dpFDYkxi5t8AJk3hvedbjrtPw/exec',
  LIFF_ID: '2007739464-gVVMBAQR',
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  REQUEST_TIMEOUT: 60000,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_FILE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
};
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

// --- グローバル変数 ---
// 写真データ用
let currentPhotoNear = { data: null, mimeType: null };
let currentPhotoFar = { data: null, mimeType: null };
// カメラ制御用
let videoStream = null;
let activeCameraTarget = null; // 'near' または 'far'
// LINE情報用
let lineAccessToken = null;
let lineUserId = null;

// --- メイン処理 ---
document.addEventListener('DOMContentLoaded', function () {
  // --- 要素の取得 ---
  const elements = {
    form: document.getElementById('report-form'),
    submitButton: document.getElementById('btn-submit'),
    loader: document.getElementById('loader'),
    // LINE関連
    lineStatus: document.getElementById('line-status'),
    lineStatusText: document.getElementById('line-status-text'),
    accessTokenInput: document.getElementById('accessToken'),
    userIdInput: document.getElementById('userId'),
    // フォーム項目
    typeRadios: document.querySelectorAll('input[name="type"]'),
    detailsTextarea: document.getElementById('details'),
    detailsRequiredNote: document.getElementById('details-required-note'),
    // 写真関連
    photoInputNear: document.getElementById('photo-near'),
    photoInputFar: document.getElementById('photo-far'),
    imagePreviewNear: document.getElementById('image-preview-near'),
    imagePreviewFar: document.getElementById('image-preview-far'),
    // 地図関連
    map: L.map('map').setView([36.871, 140.016], 16),
    coordsDisplay: document.getElementById('coords-display'),
    latInput: document.getElementById('latitude'),
    lngInput: document.getElementById('longitude'),
    // カメラ権限関連
    requestPermissionButton: document.getElementById('request-camera-permission'),
    permissionStatus: document.getElementById('permission-status'),
    cameraButtons: document.querySelectorAll('[data-role="start-camera"]'),
    // カメラモーダル関連
    cameraModal: document.getElementById('camera-modal'),
    videoWrapper: document.getElementById('video-wrapper'),
    videoElement: document.getElementById('camera-stream'),
    canvasElement: document.getElementById('camera-canvas'),
    captureButton: document.getElementById('capture-btn'),
    cancelButton: document.getElementById('cancel-camera-btn'),
    cameraErrorView: document.getElementById('camera-error-view'),
    cameraErrorText: document.getElementById('camera-error-text'),
    retryCameraButton: document.getElementById('retry-camera-btn'),
  };

  // --- 初期化処理の呼び出し ---
  initializeLIFF();
  initializeMap(elements);
  initializeCameraFeatures(elements);
  initializeFormFeatures(elements);
});


// --- 各種初期化関数 ---

/**
 * LIFFの初期化とLINEユーザー情報の取得
 */
async function initializeLIFF() {
  try {
    if (!CONFIG.LIFF_ID || CONFIG.LIFF_ID.includes('LIFF ID')) {
      updateLineStatus('warning', 'LIFF IDが設定されていません');
      return;
    }
    await liff.init({ liffId: CONFIG.LIFF_ID });

    if (liff.isLoggedIn()) {
      lineAccessToken = liff.getAccessToken();
      const profile = await liff.getProfile();
      lineUserId = profile.userId;

      document.getElementById('accessToken').value = lineAccessToken;
      document.getElementById('userId').value = lineUserId;

      updateLineStatus('success', `LINE連携済み: ${profile.displayName}`);
      setTimeout(() => document.getElementById('line-status').classList.add('hidden'), 5000);
    } else {
      updateLineStatus('prompt', 'LINEログインが必要です');
      // 必要に応じて liff.login() を呼び出すことも可能
    }
  } catch (error) {
    console.error('LIFF初期化エラー:', error);
    updateLineStatus('error', 'LINE連携に失敗しました');
  }
}

/**
 * Leaflet地図の初期化
 * @param {object} elements - DOM要素のコレクション
 */
function initializeMap(elements) {
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
    attribution: "地理院タイル（GSI ）",
    maxZoom: 18
  }).addTo(elements.map);

  const updateCenterCoords = () => {
    const center = elements.map.getCenter();
    elements.coordsDisplay.innerText = `緯度: ${center.lat.toFixed(6)} 経度: ${center.lng.toFixed(6)}`;
    elements.latInput.value = center.lat;
    elements.lngInput.value = center.lng;
    validateForm(elements); // 地図を動かすたびにバリデーション
  };

  elements.map.on('move', updateCenterCoords);
  updateCenterCoords();

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => elements.map.setView([pos.coords.latitude, pos.coords.longitude], 18),
      () => showNotification('位置情報の取得に失敗しました。手動で調整してください。', 'warning')
    );
  }
}

/**
 * カメラ関連機能の初期化
 * @param {object} elements - DOM要素のコレクション
 */
function initializeCameraFeatures(elements) {
  checkCameraPermission(elements);

  elements.requestPermissionButton.addEventListener('click', () => requestCameraPermission(elements));

  elements.cameraButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      activeCameraTarget = e.currentTarget.dataset.target; // 'near' or 'far'
      startCamera(elements);
    });
  });

  elements.captureButton.addEventListener('click', () => capturePhoto(elements));
  elements.cancelButton.addEventListener('click', () => stopCamera(elements));
  elements.retryCameraButton.addEventListener('click', () => startCamera(elements));
}

/**
 * フォーム関連機能の初期化
 * @param {object} elements - DOM要素のコレクション
 */
function initializeFormFeatures(elements) {
  const handleInputChange = () => validateForm(elements);

  elements.typeRadios.forEach(radio => radio.addEventListener('change', handleInputChange));
  elements.detailsTextarea.addEventListener('input', handleInputChange);

  elements.photoInputNear.addEventListener('change', (e) => handlePhotoInput(e.target, elements));
  elements.photoInputFar.addEventListener('change', (e) => handlePhotoInput(e.target, elements));

  elements.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!elements.submitButton.disabled) {
      handleFormSubmission(new FormData(elements.form), elements);
    }
  });

  validateForm(elements); // 初期状態のバリデーション
}


// --- UI更新・制御関数 ---

/**
 * LINE連携ステータスの表示を更新
 * @param {string} status - 'success', 'error', 'warning', 'prompt'
 * @param {string} message - 表示するメッセージ
 */
function updateLineStatus(status, message) {
  const lineStatus = document.getElementById('line-status');
  const lineStatusText = document.getElementById('line-status-text');
  if (!lineStatus || !lineStatusText) return;

  lineStatus.className = `line-status ${status}`;
  lineStatusText.textContent = message;
  lineStatus.classList.remove('hidden');
}

/**
 * ポップアップ通知を表示
 * @param {string} message - 表示するメッセージ
 * @param {string} type - 'info', 'success', 'warning', 'error'
 */
function showNotification(message, type = 'info') {
  const existingNotification = document.querySelector('.notification');
  if (existingNotification) existingNotification.remove();

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 5000);
}

/**
 * フォームの入力状態を検証し、UIを更新
 * @param {object} elements - DOM要素のコレクション
 */
function validateForm(elements) {
  const typeChecked = document.querySelector('input[name="type"]:checked');
  const isOtherSelected = typeChecked?.value === 'その他';
  const detailsValue = elements.detailsTextarea.value.trim();

  // 「その他」選択時の詳細入力欄のUI制御
  elements.detailsTextarea.required = isOtherSelected;
  elements.detailsRequiredNote.textContent = isOtherSelected ? '（必須入力）' : '';
  if (isOtherSelected && detailsValue === '') {
    elements.detailsTextarea.classList.add('invalid');
  } else {
    elements.detailsTextarea.classList.remove('invalid');
  }

  // バリデーションロジック
  let isValid = true;
  if (!typeChecked) isValid = false;
  if (isOtherSelected && detailsValue === '') isValid = false;
  if (!elements.latInput.value || !elements.lngInput.value) isValid = false;

  // 送信ボタンの有効/無効を切り替え
  elements.submitButton.disabled = !isValid;
  elements.submitButton.textContent = isValid ? 'この内容で通報する' : '必須項目を入力してください';
}

/**
 * 送信中の状態をUIに反映
 * @param {boolean} isSending - 送信中かどうか
 * @param {object} elements - DOM要素のコレクション
 */
function setSubmissionState(isSending, elements) {
  elements.loader.classList.toggle('hidden', !isSending);
  elements.form.querySelectorAll('input, select, textarea, button').forEach(el => {
    el.disabled = isSending;
  });
}


// --- カメラ関連関数 ---

/**
 * カメラ権限の状態を確認し、UIを更新
 * @param {object} elements - DOM要素のコレクション
 */
async function checkCameraPermission(elements) {
  updatePermissionStatus(elements, 'checking', '権限状態を確認中...');
  if (!navigator.mediaDevices?.getUserMedia) {
    updatePermissionStatus(elements, 'error', 'カメラAPI非対応');
    return;
  }
  if (!navigator.permissions) {
    elements.requestPermissionButton.style.display = 'block';
    updatePermissionStatus(elements, 'prompt', '直接権限要求を行ってください');
    return;
  }

  try {
    const permission = await navigator.permissions.query({ name: 'camera' });
    handlePermissionState(permission.state, elements);
    permission.onchange = () => handlePermissionState(permission.state, elements);
  } catch (error) {
    updatePermissionStatus(elements, 'error', '権限確認エラー');
  }
}

/**
 * 権限状態に応じてUIをハンドリング
 * @param {string} state - 'granted', 'denied', 'prompt'
 * @param {object} elements - DOM要素のコレクション
 */
function handlePermissionState(state, elements) {
  elements.requestPermissionButton.style.display = 'none';
  elements.cameraButtons.forEach(btn => btn.style.display = 'none');

  if (state === 'granted') {
    updatePermissionStatus(elements, 'granted', 'カメラ利用可');
    elements.cameraButtons.forEach(btn => btn.style.display = 'block');
  } else if (state === 'denied') {
    updatePermissionStatus(elements, 'denied', 'カメラ利用不可。設定を確認してください。');
  } else { // prompt
    updatePermissionStatus(elements, 'prompt', 'カメラの利用には許可が必要です。');
    elements.requestPermissionButton.style.display = 'block';
  }
}

/**
 * カメラ権限を要求
 * @param {object} elements - DOM要素のコレクション
 */
async function requestCameraPermission(elements) {
  const button = elements.requestPermissionButton;
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 権限要求中...';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach(track => track.stop());
    showNotification('カメラの利用が許可されました！', 'success');
    // 状態が 'granted' に変わるので、onchangeイベントが発火してUIが自動更新される
  } catch (error) {
    showNotification('カメラの利用が許可されませんでした。', 'error');
    // 状態が 'denied' に変わるので、onchangeイベントが発火してUIが自動更新される
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-camera"></i> カメラ機能追加';
  }
}

/**
 * カメラ権限ステータス表示を更新
 * @param {object} elements - DOM要素のコレクション
 * @param {string} state - 'granted', 'denied', 'prompt', 'checking', 'error'
 * @param {string} message - 表示メッセージ
 */
function updatePermissionStatus(elements, state, message) {
  const icons = {
    granted: '✅', denied: '❌', prompt: '⏳',
    checking: '<i class="fas fa-spinner fa-spin"></i>', error: '⚠️'
  };
  elements.permissionStatus.className = `permission-status ${state}`;
  elements.permissionStatus.innerHTML = `<span>${icons[state] || '❓'} ${message}</span>`;
}

/**
 * カメラを起動しモーダルを表示
 * @param {object} elements - DOM要素のコレクション
 */
function startCamera(elements) {
  showNotification('カメラを起動しています...', 'info');
  navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    .then(stream => {
      videoStream = stream;
      elements.videoElement.srcObject = stream;
      elements.videoWrapper.classList.remove('hidden');
      elements.cameraErrorView.classList.add('hidden');
      elements.captureButton.classList.remove('hidden');
      elements.cameraModal.classList.remove('hidden');
      showNotification('カメラが起動しました', 'success');
    })
    .catch(error => {
      console.error('カメラ起動失敗:', error);
      elements.cameraErrorText.textContent = `カメラの起動に失敗しました: ${error.message}`;
      elements.videoWrapper.classList.add('hidden');
      elements.cameraErrorView.classList.remove('hidden');
      elements.captureButton.classList.add('hidden');
      elements.cameraModal.classList.remove('hidden');
      showNotification('カメラの起動に失敗しました', 'error');
    });
}

/**
 * カメラを停止しモーダルを閉じる
 * @param {object} elements - DOM要素のコレクション
 */
function stopCamera(elements) {
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
  elements.videoElement.srcObject = null;
  elements.cameraModal.classList.add('hidden');
}

/**
 * 写真を撮影し、プレビューを更新
 * @param {object} elements - DOM要素のコレクション
 */
function capturePhoto(elements) {
  const canvas = elements.canvasElement;
  const video = elements.videoElement;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  updatePhotoForTarget(activeCameraTarget, dataUrl, 'image/jpeg', elements);

  stopCamera(elements);
  showNotification('写真を撮影しました。', 'success');
}


// --- 写真データ処理関数 ---

/**
 * ファイル選択または撮影結果から写真を処理
 * @param {string} target - 'near' or 'far'
 * @param {string} data - Base64 data URL
 * @param {string} mimeType - 画像のMIMEタイプ
 * @param {object} elements - DOM要素のコレクション
 */
function updatePhotoForTarget(target, data, mimeType, elements) {
  const preview = (target === 'near') ? elements.imagePreviewNear : elements.imagePreviewFar;
  const photoData = (target === 'near') ? currentPhotoNear : currentPhotoFar;

  if (data && mimeType) {
    preview.src = data;
    preview.style.display = 'block';
    photoData.data = data;
    photoData.mimeType = mimeType;
  } else {
    preview.src = '#';
    preview.style.display = 'none';
    photoData.data = null;
    photoData.mimeType = null;
  }
}

/**
 * ファイル入力から画像を読み込み、圧縮してプレビュー
 * @param {HTMLInputElement} input - ファイル入力要素
 * @param {object} elements - DOM要素のコレクション
 */
function handlePhotoInput(input, elements) {
  const file = input.files?.[0];
  if (!file) return;

  if (file.size > CONFIG.MAX_FILE_SIZE) {
    showNotification(`ファイルサイズが大きすぎます。${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB以下のファイルを選択してください。`, 'error');
    input.value = '';
    return;
  }
  if (!CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
    showNotification('対応していないファイル形式です。', 'error');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const MAX_DIMENSION = 1280;
      let { width, height } = img;
      if (width > height) {
        if (width > MAX_DIMENSION) {
          height *= MAX_DIMENSION / width;
          width = MAX_DIMENSION;
        }
      } else {
        if (height > MAX_DIMENSION) {
          width *= MAX_DIMENSION / height;
          height = MAX_DIMENSION;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);

      updatePhotoForTarget(input.dataset.target, compressedBase64, 'image/jpeg', elements);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  input.value = '';
}


// --- フォーム送信関数 ---

/**
 * フォーム送信処理のメインハンドラ
 * @param {FormData} formData - フォームデータ
 * @param {object} elements - DOM要素のコレクション
 */
async function handleFormSubmission(formData, elements) {
  setSubmissionState(true, elements);
  try {
    const payload = {
      latitude: formData.get('latitude'),
      longitude: formData.get('longitude'),
      type: formData.get('type'),
      details: formData.get('details') || '',
      photoNearData: currentPhotoNear.data,
      photoFarData: currentPhotoFar.data,
      accessToken: lineAccessToken,
      userId: lineUserId,
      timestamp: new Date().toISOString()
    };

    const result = await sendDataWithRetry(payload);

    showNotification('通報を受け付けました。ご協力ありがとうございます。', 'success');

    // 結果表示
    const resultBox = document.getElementById('result');
    const resultMsg = document.getElementById('result-message');
    const resultLogs = document.getElementById('result-logs');
    if (resultBox && resultMsg && resultLogs) {
      const idText = (result?.id) ? `受付番号: #${result.id}` : '';
      resultMsg.textContent = `送信に成功しました。${idText}`;
      try {
        const logsText = Array.isArray(result?.logs)
          ? result.logs.map(l => `${l.timestamp} ${l.message}${l.data ? ' ' + JSON.stringify(l.data) : ''}`).join('\n')
          : 'ログなし';
        resultLogs.textContent = logsText;
      } catch (_) {
        resultLogs.textContent = 'ログの表示に失敗しました。';
      }
      resultBox.classList.remove('hidden');
    }

    // 入力の一部のみリセット（地図や種別は保持）
    elements.detailsTextarea.value = '';
    updatePhotoForTarget('near', null, null, elements);
    updatePhotoForTarget('far', null, null, elements);
    elements.photoInputNear.value = '';
    elements.photoInputFar.value = '';
    validateForm(elements);

  } catch (error) {
    console.error('送信エラー:', error);
    showNotification(`送信に失敗しました: ${error.message}`, 'error');
    const resultBox = document.getElementById('result');
    const resultMsg = document.getElementById('result-message');
    const resultLogs = document.getElementById('result-logs');
    if (resultBox && resultMsg && resultLogs) {
      resultMsg.textContent = '送信に失敗しました。再度お試しください。';
      resultLogs.textContent = '';
      resultBox.classList.remove('hidden');
    }
  } finally {
    setSubmissionState(false, elements);
  }
}

/**
 * データをリトライ付きでGASに送信
 * @param {object} payload - 送信するデータ
 * @param {number} attempt - 現在の試行回数
 */
async function sendDataWithRetry(payload, attempt = 1) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

    const response = await fetch(CONFIG.GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain' }, // GASのdoPostはtext/plainで受け取る
      mode: 'cors',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`サーバーエラー: ${response.status}`);

    const result = await response.json();
    if (result.status !== 'success') throw new Error(result.message || 'サーバーでエラーが発生しました。');

    return result;

  } catch (error) {
    if (attempt < CONFIG.MAX_RETRY_ATTEMPTS && (error.name === 'AbortError' || !error.message.includes('サーバー'))) {
      showNotification(`送信に失敗、リトライします... (${attempt}/${CONFIG.MAX_RETRY_ATTEMPTS})`, 'warning');
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY * attempt));
      return sendDataWithRetry(payload, attempt + 1);
    }
    throw error;
  }
}

