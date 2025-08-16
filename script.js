// script.js - LINE Login channel対応版

// ▼▼▼【重要】設定値を更新してください ▼▼▼
const APP_SETTINGS = {
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  REQUEST_TIMEOUT: 30000,
  MAX_FILE_SIZE: 5 * 1024 * 1024,
  ALLOWED_FILE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
};
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

// グローバル変数
let currentPhoto1 = { data: null, mimeType: null };
let currentPhoto2 = { data: null, mimeType: null };
let activeCameraTarget = null;
let videoStream = null;
let lineAccessToken = null;
let lineUserId = null;
let CONFIG = {};
let elements = {};

document.addEventListener('DOMContentLoaded', async function() {
  try {
    // 1. Cloudflareから環境依存の設定値を取得
    const response = await fetch('/api/config');
    if (!response.ok) {
      throw new Error('設定ファイルの読み込みに失敗しました。');
    }
    const envConfig = await response.json();

    // 2. 固定的な設定値とマージして、最終的なCONFIGオブジェクトを完成させる!
    CONFIG = { ...APP_SETTINGS, ...envConfig };

    console.log('アプリケーション設定が完了しました:', CONFIG);
    // 要素の取得
    elements = {
      map: L.map('map').setView([36.871, 140.016], 16),
      coordsDisplay: document.getElementById('coords-display'),
      latInput: document.getElementById('latitude'),
      lngInput: document.getElementById('longitude'),
      form: document.getElementById('report-form'),
      loader: document.getElementById('loader'),
      // photoInput: document.getElementById('photo'),
      // imagePreview: document.getElementById('image-preview'),
      lineStatus: document.getElementById('line-status'),
      lineStatusText: document.getElementById('line-status-text'),
      accessTokenInput: document.getElementById('accessToken'),
      userIdInput: document.getElementById('userId'),
      detailsTextarea: document.getElementById('details'), // 詳細テキストエリア
      detailsRequiredNote: document.getElementById('details-required-note'), // 注釈用span
      typeRadios: document.querySelectorAll('input[name="type"]'), // 異常の種類ラジオボタン（すべて）

      // カメラ関連
      requestPermissionButton: document.getElementById('request-camera-permission'),
      permissionStatus: document.getElementById('permission-status'),
      // startCameraButton: document.getElementById('start-camera-btn'),
      photoInput1: document.getElementById('photo1'),
      imagePreview1: document.getElementById('image-preview1'),
      startCameraButton1: document.getElementById('start-camera-btn1'),
      photoInput2: document.getElementById('photo2'),
      imagePreview2: document.getElementById('image-preview2'),
      startCameraButton2: document.getElementById('start-camera-btn2'),
      cameraModal: document.getElementById('camera-modal'),
      videoWrapper: document.getElementById('video-wrapper'),
      videoElement: document.getElementById('camera-stream'),
      cameraErrorView: document.getElementById('camera-error-view'),
      cameraErrorText: document.getElementById('camera-error-text'),
      retryCameraButton: document.getElementById('retry-camera-btn'),
      canvasElement: document.getElementById('camera-canvas'),
      captureButton: document.getElementById('capture-btn'),
      cancelButton: document.getElementById('cancel-camera-btn')
    };

    // === LIFF初期化 ===
    initializeLIFF();

    // === 地図の初期化 ===
    initializeMap(elements);

    // === カメラ機能の初期化 ===
    initializeCameraFeatures(elements);

    // === フォーム機能の初期化 ===
    initializeFormFeatures(elements);

  } catch (error) {
    console.error('初期化エラー:', error);
    showNotification(error.message, 'error');
  }

  // === LIFF初期化関数（修正版） ===
  async function initializeLIFF() {
    try {
      console.log('LIFF初期化開始');

      if (CONFIG.LIFF_ID === 'LINE Login channelで作成したLIFF ID') {
        console.warn('LIFF_IDが設定されていません');
        updateLineStatus('warning', 'LIFF設定が必要です');
        return;
      }

      await liff.init({ liffId: CONFIG.LIFF_ID });
      console.log('LIFF初期化成功');

      if (liff.isLoggedIn()) {
        // アクセストークンを取得
        lineAccessToken = liff.getAccessToken();

        // プロフィール情報を取得
        const profile = await liff.getProfile();
        lineUserId = profile.userId;

        // ↓↓↓ この一行を追加する ↓↓↓
        console.log('【デバッグ用】取得したアクセストークン:', lineAccessToken);
        // ↑↑↑ この一行を追加する ↑↑↑

        // 隠しフィールドに設定
        elements.accessTokenInput.value = lineAccessToken;
        elements.userIdInput.value = lineUserId;

        updateLineStatus('success', `LINE連携済み: ${profile.displayName}`);
        console.log('LINEユーザー情報取得成功:', profile);
      } else {
        updateLineStatus('error', 'LINEログインが必要です');
        console.log('LINEログインが必要');

        // 自動ログインを試行
        try {
          await liff.login();
        } catch (loginError) {
          console.error('自動ログイン失敗:', loginError);
        }
      }
    } catch (error) {
      console.error('LIFF初期化エラー:', error);
      updateLineStatus('error', 'LINE連携エラー');
    }
  }

  // === LINE連携状態表示関数 ===
  function updateLineStatus(status, message) {
    if (!elements.lineStatus || !elements.lineStatusText) return;

    elements.lineStatus.className = `line-status ${status}`;
    elements.lineStatusText.textContent = message;
    elements.lineStatus.classList.remove('hidden');

    // 5秒後に非表示（成功時のみ）
    if (status === 'success') {
      setTimeout(() => {
        elements.lineStatus.classList.add('hidden');
      }, 5000);
    }
  }

  // === 地図初期化関数 ===
  function initializeMap(elements) {
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
      attribution: "地理院タイル（GSI）",
      maxZoom: 18
    }).addTo(elements.map);

    function updateCenterCoords() {
      const center = elements.map.getCenter();
      elements.coordsDisplay.innerText = `緯度: ${center.lat.toFixed(6)} 経度: ${center.lng.toFixed(6)}`;
      elements.latInput.value = center.lat;
      elements.lngInput.value = center.lng;
    }

    elements.map.on('move', updateCenterCoords);
    updateCenterCoords();

    // 現在位置の取得
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          elements.map.setView([pos.coords.latitude, pos.coords.longitude], 18);
        },
        function(error) {
          console.warn('位置情報の取得に失敗しました:', error);
          showNotification('位置情報の取得に失敗しました。手動で位置を調整してください。', 'warning');
        }
      );
    }
  }

  // === カメラ機能初期化 ===
  function initializeCameraFeatures(elements) {
    // 初期状態ではカメラボタンを非表示
    if (elements.startCameraButton) {
      elements.startCameraButton.style.display = 'none';
    }

    // 権限確認
    // setTimeout(() => checkCameraPermission(elements), 100);

    elements.startCameraButton1.addEventListener('click', (e) => {
      e.preventDefault();
      activeCameraTarget = 1;
      startCamera();
    });


    elements.startCameraButton2.addEventListener('click', (e) => {
      e.preventDefault();
      activeCameraTarget = 2;
      startCamera();
    });

    // イベントリスナー設定
    if (elements.requestPermissionButton) {
      elements.requestPermissionButton.addEventListener('click', (e) => {
        e.preventDefault();
        requestCameraPermission(elements);
      });
    }

    if (elements.startCameraButton) {
      elements.startCameraButton.addEventListener('click', (e) => {
        e.preventDefault();
        startCamera(elements);
      });
    }

    if (elements.retryCameraButton) {
      elements.retryCameraButton.addEventListener('click', (e) => {
        e.preventDefault();
        startCamera(elements);
      });
    }

    if (elements.cancelButton) {
      elements.cancelButton.addEventListener('click', (e) => {
        e.preventDefault();
        stopCamera(elements)
      });
    }

    if (elements.captureButton) {
      elements.captureButton.addEventListener('click', (e) => {
        e.preventDefault();
        capturePhoto(elements)
      });
    }
  }

  // === フォーム機能初期化 ===
  function initializeFormFeatures(elements) {

    // 「その他」選択時に詳細を必須にするためのイベントリスナー
    elements.typeRadios.forEach(radio => {
      radio.addEventListener('change', handleTypeChange);
    });

    // 初期状態のチェックも実行
    handleTypeChange();

    // 写真プレビュー
    elements.photoInput1.addEventListener('change', function() {
      handlePhotoInput(this, 1);
    });
    elements.photoInput2.addEventListener('change', function() {
      handlePhotoInput(this, 2);
    });

    // フォーム送信
    elements.form.addEventListener('submit', function(e) {
      e.preventDefault();
      if (!elements.loader.classList.contains('sending')) {
        const formData = new FormData(this);
        handleFormSubmission(formData, elements);
      }
    });
  }

  // 「異常の種類」が変更されたときのハンドラ関数
  function handleTypeChange() {
    const elements = { // この関数内で使う要素を再定義
      detailsTextarea: document.getElementById('details'),
      detailsRequiredNote: document.getElementById('details-required-note'),
      otherRadio: document.getElementById('type-other') // 「その他」のラジオボタン
    };

    if (elements.otherRadio && elements.otherRadio.checked) {
      // 「その他」が選択されている場合
      elements.detailsTextarea.required = true;
      elements.detailsRequiredNote.textContent = '（必須入力）';
    } else {
      // 「その他」以外が選択されている場合
      elements.detailsTextarea.required = false;
      elements.detailsRequiredNote.textContent = '';
    }
  }


  // === 共通ユーティリティ関数 ===

  // 通知表示（統合版）
  function showNotification(message, type = 'info') {
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) existingNotification.remove();

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    const colors = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6'
    };

    notification.style.cssText = `
      position: fixed; top: 20px; right: 20px; padding: 12px 20px;
      border-radius: 4px; color: white; font-weight: bold; z-index: 10000;
      max-width: 300px; word-wrap: break-word; overflow-wrap: break-word; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      background-color: ${colors[type] || colors.info};
    `;

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
  }

  // 写真データ更新（統合版）
  function updatePhoto(data, mimeType, photoNumber) {
    const targetPreview = (photoNumber === 1) ? elements.imagePreview1 : elements.imagePreview2;
    const targetPhotoData = (photoNumber === 1) ? currentPhoto1 : currentPhoto2;
    const targetInput = (photoNumber === 1) ? elements.photoInput1 : elements.photoInput2;
    targetPhotoData.data = data;
    targetPhotoData.mimeType = mimeType;

    if (data && mimeType) {
      targetPreview.src = data;
      targetPreview.style.display = 'block';
    } else {
      targetPreview.src = '#';
      targetPreview.style.display = 'none';
    }
    targetInput.value = '';
  }

  // === カメラ関連関数（統合・簡略化版） ===

  async function checkCameraPermission(elements) {
    updatePermissionStatus(elements, 'checking', '権限状態を確認中...');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        updatePermissionStatus(elements, 'error', 'カメラAPIがサポートされていません');
        return 'unsupported';
      }

      if (navigator.permissions) {
        const permission = await navigator.permissions.query({ name: 'camera' });
        const messages = {
          granted: 'カメラ利用可',
          denied: 'カメラ利用不可',
          prompt: 'カメラ未設定'
        };
        updatePermissionStatus(elements, permission.state, messages[permission.state] || '権限状態が不明です');
        return permission.state;
      } else {
        updatePermissionStatus(elements, 'prompt', 'Permission API未サポート - 直接権限要求を行ってください');
        return 'unknown';
      }
    } catch (error) {
      console.error('権限確認エラー:', error);
      updatePermissionStatus(elements, 'error', `権限確認エラー: ${error.message}`);
      return 'error';
    }
  }

  function updatePermissionStatus(elements, state, message) {
    if (!elements.permissionStatus) return;

    const icons = {
      granted: '🟢', denied: '🔴', prompt: '🟡',
      checking: '<i class="fas fa-spinner"></i>', error: '🔴'
    };
    const prefixes = {
      granted: '✅', denied: '❌', prompt: '⏳',
      checking: '🔍', error: '⚠️'
    };

    elements.permissionStatus.className = `permission-status ${state}`;
    elements.permissionStatus.innerHTML = `
      <span class="permission-status-icon">${icons[state] || '❓'}</span>
      <span>${prefixes[state] || '❓'} ${message}</span>
    `;

    // カメラボタンの表示制御
    if (elements.startCameraButton) {
      elements.startCameraButton.style.display = state === 'granted' ? 'block' : 'none';
    }
  }

  async function requestCameraPermission(elements) {
    const button = elements.requestPermissionButton;
    if (!button) return;

    button.disabled = true;
    const originalHTML = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 権限要求中...';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach(track => track.stop());

      updatePermissionStatus(elements, 'granted', 'カメラが使えます！');
      showNotification('カメラ利用可', 'success');
      return 'granted';
    } catch (error) {
      const errorMessages = {
        NotAllowedError: 'カメラ利用不可',
        NotFoundError: 'カメラデ利用不可',
        NotSupportedError: 'カメラ利用不可'
      };
      const message = errorMessages[error.name] || `エラー: ${error.message}`;
      updatePermissionStatus(elements, 'denied', message);
      showNotification(message, 'error');
      return 'denied';
    } finally {
      button.disabled = false;
      button.innerHTML = originalHTML;
    }
  }

  function startCamera(elements) {
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

  function stopCamera(elements) {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      videoStream = null;
    }
    elements.videoElement.srcObject = null;
    elements.cameraModal.classList.add('hidden');
  }

  function capturePhoto(elements) {
    const canvas = elements.canvasElement;
    const video = elements.videoElement;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    updatePhoto(dataUrl, 'image/jpeg', activeCameraTarget);
    stopCamera(elements);
    showNotification('写真を撮影しました。', 'success');
    activeCameraTarget = null;
  }

  // === 写真入力処理（画像圧縮機能付き） ===
  function handlePhotoInput(input, photoNumber) {
    if (input.files && input.files[0]) {
      const file = input.files[0];

      // 元ファイルサイズのチェックはそのまま活かす
      if (file.size > CONFIG.MAX_FILE_SIZE) {
        showNotification('ファイルサイズが大きすぎます。5MB以下のファイルを選択してください。', 'error');
        updatePhoto(null, null, elements);
        return;
      }

      // ファイル形式のチェックもそのまま活かす
      if (!CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
        showNotification('対応していないファイル形式です。', 'error');
        updatePhoto(null, null, elements);
        return;
      }

      const reader = new FileReader();

      reader.onload = (e) => {
        // ★ 元のe.target.resultをImageオブジェクトに読み込ませる
        const originalBase64 = e.target.result;
        const img = new Image();

        img.onload = () => {
          // ★ 圧縮ロジック開始
          const MAX_WIDTH = 1280; // 長辺の最大ピクセル数を設定（1280pxなら十分高画質）
          const MAX_HEIGHT = 1280;
          let width = img.width;
          let height = img.height;

          // アスペクト比を維持したままリサイズ
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          // canvasを使ってリサイズ後の画像を描画
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // ★ canvasから圧縮された新しいBase64データを取得 (JPEG形式, 品質80%)
          // PNGに透明色が含まれている場合を考慮し、背景を白で塗りつぶす
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = '#fff'; // 背景色を白に
          ctx.fillRect(0, 0, width, height);

          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85); // 品質を少し上げて0.85に

          // ★ 圧縮後のデータでUIを更新する
          // MIMEタイプは 'image/jpeg' になる
          updatePhoto(compressedBase64, 'image/jpeg', photoNumber);

          // (デバッグ用) 圧縮率を確認
          console.log(`画像圧縮完了 - 元サイズ: ${Math.round(originalBase64.length / 1024)} KB, 圧縮後サイズ: ${Math.round(compressedBase64.length / 1024)} KB`);

        };

        img.onerror = () => {
          showNotification('画像データの解析に失敗しました。', 'error');
          updatePhoto(null, null, elements);
        };

        // Imageオブジェクトのソースに、読み込んだBase64データを指定
        img.src = originalBase64;
      };

      reader.onerror = () => {
        showNotification('ファイルの読み込みに失敗しました。', 'error');
        updatePhoto(null, null, elements);
      };

      reader.readAsDataURL(file);
    }
  }

  // === フォーム送信処理（修正版） ===
  async function handleFormSubmission(formData, elements) {
    try {
      setSubmissionState(true, elements);

      // バリデーション
      const validation = validateFormData(formData);
      if (!validation.isValid) {
        throw new Error(validation.message);
      }

      // データ送信
      const result = await sendDataWithRetry(formData);

      // 成功処理
      showNotification('通報を受け付けました。ご協力ありがとうございます。', 'success');
      elements.form.reset();
      updatePhoto(null, null, 1);
      updatePhoto(null, null, 2);

    } catch (error) {
      console.error('送信エラー:', error);
      showNotification(`送信に失敗しました: ${error.message}`, 'error');
    } finally {
      setSubmissionState(false, elements);
    }
  }

  function validateFormData(formData) {
    const requiredFields = [
      { name: 'latitude', label: '場所' },
      { name: 'longitude', label: '場所' },
      { name: 'type', label: '異常の種類' }
    ];

    for (const field of requiredFields) {
      const value = formData.get(field.name);
      if (!value || value.trim() === '') {
        return {
          isValid: false,
          message: field.name.includes('itude')
            ? '場所が指定されていません。地図を動かして位置を合わせてください。'
            : `${field.label}が入力されていません。`
        };
      }
    }

    // 「その他」が選択されている場合のみ、詳細を必須チェックする
    if (formData.get('type') === 'その他') {
      const details = formData.get('details');
      if (!details || details.trim() === '') {
        return {
          isValid: false,
          message: '「その他」を選択した場合は、詳細を必ず入力してください。'
        };
      }
    }

    const lat = parseFloat(formData.get('latitude'));
    const lng = parseFloat(formData.get('longitude'));

    if (isNaN(lat) || lat < -90 || lat > 90) {
      return { isValid: false, message: '緯度の値が正しくありません。' };
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      return { isValid: false, message: '経度の値が正しくありません。' };
    }

    return { isValid: true };
  }

  async function sendDataWithRetry(formData, attempt = 1) {
    try {
      const payload = {
        latitude: formData.get('latitude'),
        longitude: formData.get('longitude'),
        type: formData.get('type'),
        details: formData.get('details'),
        photoData1: currentPhoto1.data,
        photoMimeType1: currentPhoto1.mimeType,
        photoData2: currentPhoto2.data,
        photoMimeType2: currentPhoto2.mimeType,
        accessToken: lineAccessToken, // アクセストークンを送信
        userId: lineUserId, // ユーザーIDも送信（参考用）
        timestamp: new Date().toISOString()
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

      const response = await fetch(CONFIG.GAS_WEB_APP_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'text/plain' },
        mode: 'cors',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`サーバーエラー: ${response.status} ${response.statusText}`);
      }

      const data = JSON.parse(await response.text());
      if (data.status === 'success') {
        return data;
      } else {
        throw new Error(data.message || 'サーバーでエラーが発生しました。');
      }
    } catch (error) {
      if (attempt < CONFIG.MAX_RETRY_ATTEMPTS && shouldRetry(error)) {
        showNotification(`送信に失敗しました。${CONFIG.RETRY_DELAY / 1000}秒後に再試行します... (${attempt}/${CONFIG.MAX_RETRY_ATTEMPTS})`, 'warning');
        await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
        return sendDataWithRetry(formData, attempt + 1);
      }
      throw error;
    }
  }

  function shouldRetry(error) {
    return error.name === 'AbortError' ||
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('timeout');
  }

  function setSubmissionState(isSending, elements) {
    if (isSending) {
      elements.loader.classList.remove('hidden');
      elements.loader.classList.add('sending');
    } else {
      elements.loader.classList.add('hidden');
      elements.loader.classList.remove('sending');
    }

    const formElements = elements.form.querySelectorAll('input, select, textarea, button');
    formElements.forEach(el => el.disabled = isSending);
  }

  // ページ離脱時のクリーンアップ
  window.addEventListener('beforeunload', () => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
    }
  });
});


