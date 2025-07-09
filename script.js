// script.js

// ▼▼▼【重要】あなたのGASウェブアプリのURLに書き換えてください ▼▼▼
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbztmV9q0Q6Af2k4rBPKocEQn8pWJSb7GwlDrcmWz73k23aaVwMaDsbWiJXe3HriFG03JQ/exec';
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

      // 権限状態表示エリアは最初から表示されているため、hiddenクラスの操作は不要
    }

    // カメラボタンの表示制御
    updateCameraButtonVisibility(state);

    console.log(`権限状態更新: ${state} - ${message}`);
  }

  // カメラボタンの表示制御関数
  function updateCameraButtonVisibility(permissionState) {
    if (startCameraButton) {
      if (permissionState === 'granted') {
        // 権限が許可されている場合はカメラボタンを表示
        startCameraButton.style.display = 'block';
        console.log('カメラボタンを表示しました');
      } else {
        // 権限が許可されていない場合はカメラボタンを非表示
        startCameraButton.style.display = 'none';
        console.log('カメラボタンを非表示にしました');
      }
    } else {
      console.warn('カメラボタン要素が見つかりません');
    }
  }

  // 権限状態を確認する関数
  async function checkCameraPermission() {
    console.log('=== カメラ権限状態確認開始 ===');

    updatePermissionStatus('checking', '権限状態を確認中...');

    try {
      // 基本的な環境チェック
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        updatePermissionStatus('error', 'このブラウザではカメラAPIがサポートされていません');
        return 'unsupported';
      }

      // HTTPS接続チェック
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        updatePermissionStatus('error', 'カメラアクセスにはHTTPS接続が必要です');
        return 'https_required';
      }

      // Permission APIで権限状態を確認
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

    // ボタンを無効化
    requestPermissionButton.disabled = true;
    const originalHTML = requestPermissionButton.innerHTML;
    requestPermissionButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 権限要求中...';

    updatePermissionStatus('checking', '📷 カメラ権限を要求しています...');

    try {
      // 最もシンプルな制約で権限要求
      const constraints = {
        video: true,
        audio: false
      };

      console.log('getUserMedia実行中...', constraints);

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      console.log('✅ カメラ権限取得成功!', stream);

      // ストリームを即座に停止（テスト目的のため）
      stream.getTracks().forEach(track => track.stop());

      updatePermissionStatus('granted', 'カメラ権限が正常に設定されました！');
      requestPermissionButton.innerHTML = '<i class="fas fa-camera"></i> カメラをテスト';

      // 成功通知
      showNotification('カメラ権限が正常に設定されました。写真撮影機能が利用可能です。', 'success');

      // カメラボタンを表示（updatePermissionStatusで自動的に制御される）
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
      // ボタンを有効化
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

  // カメラ起動処理 - 最もシンプルで確実な実装
  function startCamera() {
    console.log('=== カメラ起動処理開始 ===');

    // 基本的な環境チェック
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

    console.log('環境チェック完了 - getUserMediaを実行');

    // 最もシンプルな制約で権限要求
    const constraints = {
      video: true,
      audio: false
    };

    console.log('getUserMedia実行中...', constraints);

    // 権限要求の実行
    navigator.mediaDevices.getUserMedia(constraints)
      .then(function(stream) {
        console.log('✅ カメラ権限取得成功!', stream);
        videoStream = stream;
        handleCameraSuccess(stream);
      })
      .catch(function(error) {
        console.error('❌ カメラ権限取得失敗:', error);

        // 背面カメラ指定で再試行
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

  // カメラ成功時の処理
  function handleCameraSuccess(stream) {
    console.log('カメラストリーム取得成功 - UI更新開始');

    // UIの更新
    videoWrapper.classList.remove('hidden');
    cameraErrorView.classList.add('hidden');
    captureButton.classList.remove('hidden');

    // ビデオ要素にストリームを設定
    videoElement.srcObject = stream;

    // 必要な属性を設定
    videoElement.autoplay = true;
    videoElement.muted = true;
    videoElement.playsInline = true;

    // iOS Safari対応
    videoElement.setAttribute('autoplay', 'true');
    videoElement.setAttribute('muted', 'true');
    videoElement.setAttribute('playsinline', 'true');
    videoElement.setAttribute('webkit-playsinline', 'true');

    // ビデオの再生
    const playPromise = videoElement.play();
    if (playPromise !== undefined) {
      playPromise
        .then(function() {
          console.log('ビデオ再生成功');
        })
        .catch(function(playError) {
          console.warn('ビデオ自動再生失敗:', playError);
          // 自動再生に失敗しても続行
        });
    }

    // モーダルを開く
    cameraModal.classList.remove('hidden');
    showNotification('カメラが起動しました', 'success');

    console.log('カメラ起動完了');
  }

  // カメラエラー処理
  function handleCameraError(err) {
    console.error('カメラの起動に失敗:', err);

    let message = 'カメラの起動に失敗しました。';
    let guidance = '';
    let showPermissionPage = false;

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      message = 'カメラへのアクセスが拒否されました。';
      guidance = `
        <strong>解決方法:</strong><br>
        1. ブラウザのアドレスバーにあるカメラアイコンをクリック<br>
        2. 「カメラ」を「許可」に変更<br>
        3. ページを再読み込み<br><br>
        <strong>または設定から:</strong><br>
        • Android: 設定 → アプリ → ブラウザ → 権限 → カメラ → 許可<br>
        • iPhone: 設定 → Safari → カメラ → 許可<br><br>
        <div style="margin-top: 16px;">
          <button id="open-permission-guide" style="
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 12px 20px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(79, 172, 254, 0.3);
          ">📱 詳細な設定ガイドを開く</button>
        </div>
      `;
      showPermissionPage = true;
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
    } else if (err.message && err.message.includes('HTTPS')) {
      message = 'HTTPS接続が必要です。';
      guidance = 'カメラ機能を使用するには、HTTPS接続でアクセスしてください。';
    } else if (err.message && err.message.includes('サポート')) {
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

    // カメラアクセス拒否の場合、権限ガイドページを開くボタンのイベントリスナーを追加
    if (showPermissionPage) {
      // setTimeoutを使わず、即座にイベントリスナーを設定
      const permissionGuideButton = document.getElementById('open-permission-guide');
      if (permissionGuideButton) {
        // 既存のイベントリスナーを削除
        permissionGuideButton.removeEventListener('click', openCameraPermissionGuide);

        // 新しいイベントリスナーを追加（ユーザー操作コンテキストを確保）
        permissionGuideButton.addEventListener('click', function(event) {
          console.log('=== 詳細設定ガイドボタンクリック ===');
          console.log('イベント詳細:', {
            type: event.type,
            isTrusted: event.isTrusted,
            timeStamp: event.timeStamp
          });

          // イベントの伝播を停止
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          // 即座にポップアップを開く（ユーザー操作の直後）
          openCameraPermissionGuide();
        }, { once: false, passive: false });

        console.log('権限ガイドボタンのイベントリスナーを設定しました');
      } else {
        console.warn('権限ガイドボタンが見つかりません');

        // ボタンが見つからない場合は、少し待ってから再試行
        setTimeout(function() {
          const retryButton = document.getElementById('open-permission-guide');
          if (retryButton) {
            retryButton.addEventListener('click', function(event) {
              event.preventDefault();
              event.stopPropagation();
              openCameraPermissionGuide();
            });
            console.log('権限ガイドボタンのイベントリスナーを再設定しました');
          }
        }, 50);
      }
    }
  }

  // カメラ権限ガイドページをポップアップウィンドウで開く関数
  function openCameraPermissionGuide() {
    console.log('=== ポップアップウィンドウ開始処理 ===');

    try {
      // ポップアップウィンドウのサイズと位置を計算
      const popupWidth = 480;
      const popupHeight = 700;
      const screenWidth = window.screen.availWidth || window.screen.width;
      const screenHeight = window.screen.availHeight || window.screen.height;
      const left = Math.max(0, (screenWidth - popupWidth) / 2);
      const top = Math.max(0, (screenHeight - popupHeight) / 2);

      // ポップアップウィンドウの設定（最小限の設定で確実に開く）
      const popupFeatures = [
        `width=${popupWidth}`,
        `height=${popupHeight}`,
        `left=${left}`,
        `top=${top}`,
        'resizable=yes',
        'scrollbars=yes'
      ].join(',');

      console.log('ポップアップ設定:', {
        url: 'basic_camera_permission.html?from=report-form',
        features: popupFeatures,
        screenSize: `${screenWidth}x${screenHeight}`,
        position: `${left},${top}`
      });

      // 即座にポップアップを開く（ユーザー操作コンテキスト内で実行）
      const permissionWindow = window.open(
        'basic_camera_permission.html?from=report-form',
        'cameraPermissionGuide',
        popupFeatures
      );

      console.log('window.open実行結果:', permissionWindow);

      // ポップアップの状態を確認
      if (!permissionWindow || permissionWindow.closed) {
        console.warn('ポップアップがブロックされました');
        handlePopupBlocked();
      } else {
        console.log('ポップアップが正常に開きました');
        handlePopupSuccess(permissionWindow);
      }

    } catch (error) {
      console.error('ポップアップ開始処理でエラー:', error);
      handlePopupError(error);
    }
  }

  // ポップアップが正常に開いた場合の処理
  function handlePopupSuccess(permissionWindow) {
    showNotification('カメラ権限設定ガイドをポップアップで開きました', 'success');

    // ポップアップにフォーカスを当てる
    try {
      permissionWindow.focus();
    } catch (focusError) {
      console.warn('ポップアップフォーカスエラー:', focusError);
    }

    // ポップアップが閉じられたときの処理
    const checkClosed = setInterval(function() {
      try {
        if (permissionWindow.closed) {
          clearInterval(checkClosed);
          console.log('ポップアップウィンドウが閉じられました');
          showNotification('設定ガイドが閉じられました。カメラ機能を再度お試しください。', 'info');
        }
      } catch (checkError) {
        // クロスオリジンエラーなどを無視
        clearInterval(checkClosed);
      }
    }, 1000);

    // モーダルを閉じる
    stopCamera();
  }

  // ポップアップがブロックされた場合の処理
  function handlePopupBlocked() {
    console.log('ポップアップブロック対策を実行');

    showNotification('ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。', 'warning');

    // ユーザーに選択肢を提示
    const userChoice = confirm(
      'ポップアップがブロックされました。\n\n' +
      '対処法:\n' +
      '1. ブラウザのアドレスバーにあるポップアップブロックアイコンをクリックして許可\n' +
      '2. 「OK」を押してカメラ権限設定ページに移動\n' +
      '3. 「キャンセル」を押して現在のページに留まる\n\n' +
      'カメラ権限設定ページに移動しますか？'
    );

    if (userChoice) {
      console.log('ユーザーが移動を選択');
      window.location.href = 'basic_camera_permission.html?from=report-form';
    } else {
      console.log('ユーザーが現在のページに留まることを選択');
      showNotification('ブラウザの設定でポップアップを許可してから再度お試しください。', 'info');
    }
  }

  // ポップアップエラー時の処理
  function handlePopupError(error) {
    console.error('ポップアップエラー詳細:', error);

    showNotification('ポップアップの表示に失敗しました。', 'error');

    // エラーの場合も移動の選択肢を提示
    const userChoice = confirm(
      'ポップアップの表示に失敗しました。\n\n' +
      'カメラ権限設定ページに移動しますか？\n' +
      '（このページから離れます）'
    );

    if (userChoice) {
      window.location.href = 'basic_camera_permission.html?from=report-form';
    }
  }

  // カメラを停止し、ビューの状態をリセットする関数
  function stopCamera() {
    if (videoStream) {
      videoStream.getTracks().forEach(function(track) {
        track.stop();
      });
      videoStream = null;
    }
    videoElement.srcObject = null;
    cameraModal.classList.add('hidden');

    // モーダルを閉じる際に、ビューの状態を次回のためにリセットする
    setTimeout(function() {
      videoWrapper.classList.remove('hidden');
      cameraErrorView.classList.add('hidden');
      captureButton.classList.remove('hidden');
    }, 300);
  }

  // === イベントリスナー ===

  // 「カメラで撮影」ボタンが押されたらカメラを起動
  startCameraButton.addEventListener('click', function(event) {
    console.log('=== カメラボタンクリック ===');
    console.log('イベント詳細:', {
      type: event.type,
      isTrusted: event.isTrusted,
      timeStamp: event.timeStamp
    });

    event.preventDefault();
    event.stopPropagation();

    // 即座にカメラ起動を実行
    startCamera();
  });

  // 「再試行」ボタンが押されたら、もう一度カメラを起動
  retryCameraButton.addEventListener('click', function(event) {
    console.log('=== 再試行ボタンクリック ===');
    event.preventDefault();
    event.stopPropagation();
    startCamera();
  });

  // 「キャンセル」ボタンが押されたらカメラを停止
  cancelButton.addEventListener('click', stopCamera);

  // 「撮影」写真データの処理
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

    // 二重送信防止
    if (loader.classList.contains('sending')) {
      return;
    }

    const formData = new FormData(form);
    handleFormSubmission(formData);
  });

  // フォーム送信の処理
  async function handleFormSubmission(formData) {
    try {
      // 送信状態の設定
      setSubmissionState(true);

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

  // フォームデータの検証
  function validateFormData(formData) {
    console.log('緯度の値:', formData.get('latitude'));
    console.log('経度の値:', formData.get('longitude'));
    console.log('通報種別の値:', formData.get('type'));

    // 必須フィールドのチェック
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
        timestamp: new Date().toISOString()
      };

      // タイムアウト付きfetch
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

        await new Promise(function(resolve) {
          setTimeout(resolve, CONFIG.RETRY_DELAY);
        });
        return sendDataWithRetry(formData, photoData, photoMimeType, attempt + 1);
      }

      // 最終的な失敗
      throw error;
    }
  }

  // リトライすべきエラーかどうかの判定
  function shouldRetry(error) {
    return error.name === 'AbortError' ||
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('timeout');
  }

  // 送信成功時の処理
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

  // 送信エラー時の処理
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

  // 送信状態の設定
  function setSubmissionState(isSending) {
    if (isSending) {
      loader.classList.remove('hidden');
      loader.classList.add('sending');

      // フォーム要素を無効化
      const formElements = form.querySelectorAll('input, select, textarea, button');
      for (let i = 0; i < formElements.length; i++) {
        formElements[i].disabled = true;
      }

    } else {
      loader.classList.add('hidden');
      loader.classList.remove('sending');

      // フォーム要素を有効化
      const formElements = form.querySelectorAll('input, select, textarea, button');
      for (let i = 0; i < formElements.length; i++) {
        formElements[i].disabled = false;
      }
    }
  }

  // 通知メッセージの表示
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



