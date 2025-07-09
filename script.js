// script.js - LINE連携対応版

// ▼▼▼【重要】あなたのGASウェブアプリのURLに書き換えてください ▼▼▼
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyN04RxTUnZa5M8qoKDL34i5gSyFRyAZ9w3zXkU-jMSwJj5FcP6X5TyRlP7j6rxNf4jSg/exec';
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

// 設定
const CONFIG = {
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  REQUEST_TIMEOUT: 30000,
  MAX_FILE_SIZE: 5 * 1024 * 1024,
  ALLOWED_FILE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
};

let currentPhoto = {
  data: null,
  mimeType: null
};

let videoStream = null;
let userInfo = {
  userId: null,
  source: null
};

document.addEventListener('DOMContentLoaded', function() {
  // URLパラメータからユーザー情報を取得
  extractUserInfoFromUrl();

  // LINE環境の検出
  detectLineEnvironment();

  // === 要素の取得 ===
  const map = L.map('map').setView([36.871, 140.016], 16);
  const coordsDisplay = document.getElementById('coords-display');
  const latInput = document.getElementById('latitude');
  const lngInput = document.getElementById('longitude');
  const form = document.getElementById('report-form');
  const loader = document.getElementById('loader');
  const photoInput = document.getElementById('photo');
  const imagePreview = document.getElementById('image-preview');

  // カメラ権限関連の要素
  const requestPermissionButton = document.getElementById('request-camera-permission');
  const permissionStatus = document.getElementById('permission-status');

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
    console.error('カメラで撮影ボタンが見つかりません。');
  } else {
    // 初期状態ではカメラボタンを非表示にする（権限確認後に表示制御）
    startCameraButton.style.display = 'none';
    console.log('カメラボタンを初期状態で非表示に設定しました');
  }

  // === URLパラメータからユーザー情報を取得 ===
  function extractUserInfoFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);

    // ユーザーIDの取得
    userInfo.userId = urlParams.get('userId') || urlParams.get('user_id') || null;
    userInfo.source = urlParams.get('source') || 'web';

    console.log('ユーザー情報:', userInfo);

    if (userInfo.userId) {
      showNotification('LINEからのアクセスを確認しました。', 'info');
    }
  }

  // === LINE環境の検出 ===
  function detectLineEnvironment() {
    const userAgent = navigator.userAgent;
    const isLine = userAgent.includes('Line/');
    const isLineInApp = userAgent.includes('Line/') && userAgent.includes('Mobile');

    if (isLine) {
      console.log('LINE環境で実行中');
      document.body.classList.add('line-environment');

      // LINE環境での最適化
      optimizeForLineEnvironment();
    }
  }

  // === LINE環境での最適化 ===
  function optimizeForLineEnvironment() {
    // フォントサイズの調整
    document.documentElement.style.setProperty('--base-font-size', '16px');

    // タップ領域の拡大
    const buttons = document.querySelectorAll('button, .radio-item');
    buttons.forEach(button => {
      button.style.minHeight = '48px';
    });

    // 戻るボタンの追加（必要に応じて）
    addBackToLineButton();
  }

  // === LINEに戻るボタンの追加 ===
  function addBackToLineButton() {
    if (userInfo.source === 'line' && userInfo.userId) {
      const backButton = document.createElement('div');
      backButton.className = 'back-to-line-button';
      backButton.innerHTML = `
        <button type="button" onclick="window.close()" class="line-back-button">
          <i class="fas fa-arrow-left"></i> LINEに戻る
        </button>
      `;

      // フォームの上部に挿入
      const container = document.querySelector('.container');
      container.insertBefore(backButton, container.firstChild);
    }
  }

  // === カメラ権限管理機能 ===

  // 権限状態を表示する関数
  function updatePermissionStatus(state, message) {
    if (permissionStatus) {
      permissionStatus.className = `permission-status ${state}`;

      // 状態に応じたアイコンと絵文字を追加
      let iconHTML = '';
      let statusMessage = '';

      switch (state) {
        case 'granted':
          iconHTML = '<span class="permission-status-icon">🟢</span>';
          statusMessage = `✅ ${message}`;
          break;
        case 'denied':
          iconHTML = '<span class="permission-status-icon">🔴</span>';
          statusMessage = `❌ ${message}`;
          break;
        case 'prompt':
          iconHTML = '<span class="permission-status-icon">🟡</span>';
          statusMessage = `⏳ ${message}`;
          break;
        case 'checking':
          iconHTML = '<span class="permission-status-icon"><i class="fas fa-spinner"></i></span>';
          statusMessage = `🔍 ${message}`;
          break;
        case 'error':
          iconHTML = '<span class="permission-status-icon">🔴</span>';
          statusMessage = `⚠️ ${message}`;
          break;
        default:
          iconHTML = '<span class="permission-status-icon">❓</span>';
          statusMessage = `❓ ${message}`;
      }

      permissionStatus.innerHTML = `
        ${iconHTML}
        <span>${statusMessage}</span>
      `;
    }

    // カメラボタンの表示制御
    updateCameraButtonVisibility(state);

    console.log(`権限状態更新: ${state} - ${message}`);
  }

  // カメラボタンの表示制御関数
  function updateCameraButtonVisibility(permissionState) {
    if (startCameraButton) {
      if (permissionState === 'granted') {
        startCameraButton.style.display = 'block';
        console.log('カメラボタンを表示しました');
      } else {
        startCameraButton.style.display = 'none';
        console.log('カメラボタンを非表示にしました');
      }
    }
  }

  // 権限状態を確認する関数
  async function checkCameraPermission() {
    console.log('=== カメラ権限状態確認開始 ===');

    updatePermissionStatus('checking', '権限状態を確認中...');

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        updatePermissionStatus('error', 'このブラウザではカメラAPIがサポートされていません');
        return 'unsupported';
      }

      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        updatePermissionStatus('error', 'カメラアクセスにはHTTPS接続が必要です');
        return 'https_required';
      }

      if (navigator.permissions) {
        const permission = await navigator.permissions.query({ name: 'camera' });
        const state = permission.state;

        console.log(`Permission API結果: ${state}`);

        switch (state) {
          case 'granted':
            updatePermissionStatus('granted', 'カメラアクセスが許可されています');
            if (requestPermissionButton) {
              requestPermissionButton.innerHTML = '<i class="fas fa-camera"></i> カメラをテスト';
            }
            break;
          case 'denied':
            updatePermissionStatus('denied', 'カメラアクセスが拒否されています');
            if (requestPermissionButton) {
              requestPermissionButton.innerHTML = '<i class="fas fa-redo"></i> 権限設定を確認';
            }
            break;
          case 'prompt':
            updatePermissionStatus('prompt', 'カメラ権限が未設定です');
            if (requestPermissionButton) {
              requestPermissionButton.innerHTML = '<i class="fas fa-camera"></i> カメラ権限を要求';
            }
            break;
          default:
            updatePermissionStatus('error', '権限状態が不明です');
        }

        return state;
      } else {
        updatePermissionStatus('prompt', 'ℹ️ Permission API未サポート - 直接権限要求を行ってください');
        return 'unknown';
      }

    } catch (error) {
      console.error('権限確認エラー:', error);
      updatePermissionStatus('error', `権限確認エラー: ${error.message}`);
      return 'error';
    }
  }

  // カメラ権限を要求する関数
  async function requestCameraPermission() {
    console.log('=== カメラ権限要求開始 ===');

    if (!requestPermissionButton) {
      console.error('権限要求ボタンが見つかりません');
      return;
    }

    requestPermissionButton.disabled = true;
    const originalHTML = requestPermissionButton.innerHTML;
    requestPermissionButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 権限要求中...';

    updatePermissionStatus('checking', '📷 カメラ権限を要求しています...');

    try {
      const constraints = {
        video: true,
        audio: false
      };

      console.log('getUserMedia実行中...', constraints);

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      console.log('✅ カメラ権限取得成功!', stream);

      stream.getTracks().forEach(track => track.stop());

      updatePermissionStatus('granted', 'カメラ権限が正常に設定されました！');
      requestPermissionButton.innerHTML = '<i class="fas fa-camera"></i> カメラをテスト';

      showNotification('カメラ権限が正常に設定されました。写真撮影機能が利用可能です。', 'success');

      console.log('権限取得成功 - カメラボタンが表示されます');

      return 'granted';

    } catch (error) {
      console.error('❌ カメラ権限要求失敗:', error);

      let errorMessage = 'カメラ権限の要求に失敗しました。';
      let statusClass = 'denied';

      switch (error.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          errorMessage = 'カメラアクセスが拒否されました。ブラウザの設定で許可してください。';
          break;
        case 'NotFoundError':
          errorMessage = 'カメラデバイスが見つかりません。';
          break;
        case 'NotSupportedError':
          errorMessage = 'このブラウザではカメラがサポートされていません。';
          statusClass = 'error';
          break;
        case 'NotReadableError':
          errorMessage = 'カメラが他のアプリで使用中です。';
          break;
        default:
          errorMessage = `エラー: ${error.message}`;
          statusClass = 'error';
      }

      updatePermissionStatus(statusClass, errorMessage);
      showNotification(errorMessage, 'error');

      return 'denied';

    } finally {
      requestPermissionButton.disabled = false;
      requestPermissionButton.innerHTML = originalHTML;
    }
  }

  // === イベントリスナーの設定 ===

  // 権限要求ボタン
  if (requestPermissionButton) {
    requestPermissionButton.addEventListener('click', function(event) {
      console.log('権限要求ボタンクリック');
      event.preventDefault();
      requestCameraPermission();
    });
  }

  // 初期権限チェックを実行
  setTimeout(() => {
    checkCameraPermission();
  }, 100);

  // === 地図の初期化 ===
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
    attribution: "地理院タイル（GSI）",
    maxZoom: 18
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
      function(pos) {
        map.setView([pos.coords.latitude, pos.coords.longitude], 18);
      },
      function(error) {
        console.warn('位置情報の取得に失敗しました:', error);
        showNotification('位置情報の取得に失敗しました。手動で位置を調整してください。', 'warning');
      }
    );
  }

  // 写真データとプレビューを更新する共通関数
  function updatePhoto(data, mimeType) {
    if (data && mimeType) {
      currentPhoto.data = data;
      currentPhoto.mimeType = mimeType;
      imagePreview.src = data;
      imagePreview.style.display = 'block';
      photoInput.value = '';
    } else {
      currentPhoto.data = null;
      currentPhoto.mimeType = null;
      imagePreview.src = '#';
      imagePreview.style.display = 'none';
      photoInput.value = '';
    }
  }

  // === 写真プレビューと検証 ===
  photoInput.addEventListener('change', function() {
    if (this.files && this.files[0]) {
      const file = this.files[0];

      if (file.size > CONFIG.MAX_FILE_SIZE) {
        showNotification('ファイルサイズが大きすぎます。5MB以下のファイルを選択してください。', 'error');
        updatePhoto(null, null);
        return;
      }

      if (!CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
        showNotification('対応していないファイル形式です。JPEG、PNG、GIF、WebPファイルを選択してください。', 'error');
        updatePhoto(null, null);
        return;
      }

      const reader = new FileReader();
      reader.onload = function(e) {
        updatePhoto(e.target.result, file.type);
      };
      reader.onerror = function() {
        showNotification('ファイルの読み込みに失敗しました。', 'error');
        updatePhoto(null, null);
      };
      reader.readAsDataURL(file);
    }
  });

  // === カメラ撮影のロジック ===

  function startCamera() {
    console.log('=== カメラ起動処理開始 ===');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('MediaDevices API not supported');
      handleCameraError(new Error('このブラウザではカメラAPIがサポートされていません'));
      return;
    }

    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      console.error('HTTPS connection required');
      handleCameraError(new Error('カメラアクセスにはHTTPS接続が必要です'));
      return;
    }

    console.log('環境チェック完了 - getUserMediaを実行');

    const constraints = {
      video: true,
      audio: false
    };

    console.log('getUserMedia実行中...', constraints);

    navigator.mediaDevices.getUserMedia(constraints)
      .then(function(stream) {
        console.log('✅ カメラ権限取得成功!', stream);
        videoStream = stream;
        handleCameraSuccess(stream);
      })
      .catch(function(error) {
        console.error('❌ カメラ権限取得失敗:', error);

        if (error.name !== 'NotAllowedError' && error.name !== 'PermissionDeniedError') {
          console.log('背面カメラ指定で再試行...');

          const fallbackConstraints = {
            video: {
              facingMode: 'environment'
            },
            audio: false
          };

          navigator.mediaDevices.getUserMedia(fallbackConstraints)
            .then(function(stream) {
              console.log('✅ 背面カメラで成功!', stream);
              videoStream = stream;
              handleCameraSuccess(stream);
            })
            .catch(function(fallbackError) {
              console.error('❌ 背面カメラでも失敗:', fallbackError);
              handleCameraError(fallbackError);
            });
        } else {
          handleCameraError(error);
        }
      });
  }

  function handleCameraSuccess(stream) {
    console.log('カメラストリーム取得成功 - UI更新開始');

    videoWrapper.classList.remove('hidden');
    cameraErrorView.classList.add('hidden');
    captureButton.classList.remove('hidden');

    videoElement.srcObject = stream;
    videoElement.autoplay = true;
    videoElement.muted = true;
    videoElement.playsInline = true;

    videoElement.setAttribute('autoplay', 'true');
    videoElement.setAttribute('muted', 'true');
    videoElement.setAttribute('playsinline', 'true');
    videoElement.setAttribute('webkit-playsinline', 'true');

    const playPromise = videoElement.play();
    if (playPromise !== undefined) {
      playPromise
        .then(function() {
          console.log('ビデオ再生成功');
        })
        .catch(function(playError) {
          console.warn('ビデオ自動再生失敗:', playError);
        });
    }

    cameraModal.classList.remove('hidden');
    showNotification('カメラが起動しました', 'success');

    console.log('カメラ起動完了');
  }

  function handleCameraError(err) {
    console.error('カメラの起動に失敗:', err);

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
    } else {
      message = `エラーが発生しました: ${err.message}`;
      guidance = 'ページを再読み込みして再試行してください。';
    }

    cameraErrorText.innerHTML = `
      <div style="text-align: left;">
        <p style="font-weight: bold; color: #dc3545; margin-bottom: 12px;">${message}</p>
        <div style="font-size: 14px; line-height: 1.5;">${guidance}</div>
      </div>
    `;

    videoWrapper.classList.add('hidden');
    cameraErrorView.classList.remove('hidden');
    captureButton.classList.add('hidden');

    cameraModal.classList.remove('hidden');
    showNotification(message, 'error');
  }

  function stopCamera() {
    if (videoStream) {
      videoStream.getTracks().forEach(function(track) {
        track.stop();
      });
      videoStream = null;
    }
    videoElement.srcObject = null;
    cameraModal.classList.add('hidden');

    setTimeout(function() {
      videoWrapper.classList.remove('hidden');
      cameraErrorView.classList.add('hidden');
      captureButton.classList.remove('hidden');
    }, 300);
  }

  // === イベントリスナー ===

  startCameraButton.addEventListener('click', function(event) {
    console.log('=== カメラボタンクリック ===');
    event.preventDefault();
    event.stopPropagation();
    startCamera();
  });

  retryCameraButton.addEventListener('click', function(event) {
    console.log('=== 再試行ボタンクリック ===');
    event.preventDefault();
    event.stopPropagation();
    startCamera();
  });

  cancelButton.addEventListener('click', stopCamera);

  captureButton.addEventListener('click', function() {
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

    if (loader.classList.contains('sending')) {
      return;
    }

    const formData = new FormData(form);
    handleFormSubmission(formData);
  });

  // フォーム送信の処理
  async function handleFormSubmission(formData) {
    try {
      setSubmissionState(true);

      const validationResult = validateFormData(formData);
      if (!validationResult.isValid) {
        throw new Error(validationResult.message);
      }

      const result = await sendDataWithRetry(formData, currentPhoto.data, currentPhoto.mimeType);
      handleSubmissionSuccess(result);

    } catch (error) {
      handleSubmissionError(error);
    } finally {
      setSubmissionState(false);
    }
  }

  // フォームデータの検証
  function validateFormData(formData) {
    console.log('緯度の値:', formData.get('latitude'));
    console.log('経度の値:', formData.get('longitude'));
    console.log('通報種別の値:', formData.get('type'));

    const requiredFields = [
      { name: 'latitude', label: '場所' },
      { name: 'longitude', label: '場所' },
      { name: 'type', label: '異常の種類' }
    ];

    for (let i = 0; i < requiredFields.length; i++) {
      const field = requiredFields[i];
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

  // データ送信（リトライ機能付き）
  async function sendDataWithRetry(formData, photoData, photoMimeType, attempt = 1) {
    try {
      const payload = {
        latitude: formData.get('latitude'),
        longitude: formData.get('longitude'),
        type: formData.get('type'),
        details: formData.get('details'),
        photoData: photoData,
        photoMimeType: photoMimeType,
        timestamp: new Date().toISOString(),
        userId: userInfo.userId, // ユーザーIDを追加
        source: userInfo.source   // アクセス元を追加
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(function() {
        controller.abort();
      }, CONFIG.REQUEST_TIMEOUT);

      const response = await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'text/plain'
        },
        mode: 'cors',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`サーバーエラー: ${response.status} ${response.statusText}`);
      }

      let data;
      try {
        const responseText = await response.text();
        data = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error('サーバーからの応答を解析できませんでした。');
      }

      if (data.status === 'success' || data.status === 'partial_success') {
        return data;
      } else {
        throw new Error(data.message || 'サーバーでエラーが発生しました。');
      }

    } catch (error) {
      console.error(`送信試行 ${attempt} 失敗:`, error);

      if (attempt < CONFIG.MAX_RETRY_ATTEMPTS && shouldRetry(error)) {
        showNotification(`送信に失敗しました。${CONFIG.RETRY_DELAY / 1000}秒後に再試行します... (${attempt}/${CONFIG.MAX_RETRY_ATTEMPTS})`, 'warning');

        await new Promise(function(resolve) {
          setTimeout(resolve, CONFIG.RETRY_DELAY);
        });
        return sendDataWithRetry(formData, photoData, photoMimeType, attempt + 1);
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

  // 送信成功時の処理
  function handleSubmissionSuccess(result) {
    let message = '通報を受け付けました。ご協力ありがとうございます。';
    let notificationType = 'success';

    if (result.status === 'partial_success') {
      message = result.message;
      notificationType = 'warning';

      if (result.details) {
        console.log('送信結果詳細:', result.details);
        if (result.errors && result.errors.length > 0) {
          console.warn('エラー詳細:', result.errors);
        }
      }
    }

    // LINE環境の場合は特別なメッセージ
    if (userInfo.userId) {
      message += '\n\nLINEに確認メッセージを送信しました。';
    }

    showNotification(message, notificationType);

    // フォームのリセット
    form.reset();
    imagePreview.style.display = 'none';
    updatePhoto(null, null);
    updateCenterCoords();

    console.log('送信成功:', result);

    // LINE環境の場合、数秒後に自動的にLINEに戻る案内
    if (userInfo.userId) {
      setTimeout(() => {
        showNotification('LINEアプリに戻って確認メッセージをご確認ください。', 'info');
      }, 3000);
    }
  }

  // 送信エラー時の処理
  function handleSubmissionError(error) {
    console.error('送信エラー:', error);

    let errorMessage = '送信に失敗しました。';

    if (error.name === 'AbortError') {
      errorMessage = '送信がタイムアウトしました。ネットワーク接続を確認してください。';
    } else if (error.message.includes('CORS')) {
      errorMessage = 'サーバーとの通信に問題があります。しばらく時間をおいて再度お試しください。';
    } else if (error.message) {
      errorMessage = `エラー: ${error.message}`;
    }

    showNotification(errorMessage, 'error');
  }

  // 送信状態の設定
  function setSubmissionState(isSending) {
    if (isSending) {
      loader.classList.remove('hidden');
      loader.classList.add('sending');

      const formElements = form.querySelectorAll('input, select, textarea, button');
      for (let i = 0; i < formElements.length; i++) {
        formElements[i].disabled = true;
      }

    } else {
      loader.classList.add('hidden');
      loader.classList.remove('sending');

      const formElements = form.querySelectorAll('input, select, textarea, button');
      for (let i = 0; i < formElements.length; i++) {
        formElements[i].disabled = false;
      }
    }
  }

  // 通知メッセージの表示
  function showNotification(message, type = 'info') {
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

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

    setTimeout(function() {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }

  // ページ離脱時のクリーンアップ
  window.addEventListener('beforeunload', function() {
    if (videoStream) {
      videoStream.getTracks().forEach(function(track) {
        track.stop();
      });
    }
  });
});


