// script.js

// ▼▼▼【重要】あなたのGASウェブアプリのURLに書き換えてください ▼▼▼
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxn3KukqglLoMFSdfcVPB8zmXL_n4DYRknSzW_C1W82FCKVJ623tUsXf_77OKZZfFCS4w/exec';
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

document.addEventListener('DOMContentLoaded', function () {
  // === 要素の取得 ===
  const map = L.map('map').setView([36.8711457540221, 140.01606029114237
  ], 16);
  const coordsDisplay = document.getElementById('coords-display');
  const latInput = document.getElementById('latitude');
  const lngInput = document.getElementById('longitude');
  const form = document.getElementById('report-form');
  const loader = document.getElementById('loader');
  const photoInput = document.getElementById('photo');
  const imagePreview = document.getElementById('image-preview');

  // === 地図の初期化 ===
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
    attribution: "地理院タイル（GSI）", maxZoom: 18,
  }).addTo(map);

  function updateCenterCoords() {
    const center = map.getCenter();
    coordsDisplay.innerText = `緯度: ${center.lat.toFixed(6)} 経度: ${center.lng.toFixed(6)}`;
    latInput.value = center.lat;
    lngInput.value = center.lng;
  }
  map.on('move', updateCenterCoords);
  updateCenterCoords();

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      map.setView([pos.coords.latitude, pos.coords.longitude], 18);
    });
  }

  // === 写真プレビュー ===
  photoInput.addEventListener('change', function () {
    if (this.files && this.files[0]) {
      const reader = new FileReader();
      reader.onload = e => {
        imagePreview.src = e.target.result;
        imagePreview.style.display = 'block';
      }
      reader.readAsDataURL(this.files[0]);
    }
  });

  // === フォーム送信処理 ===
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    loader.classList.remove('hidden');

    const file = photoInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => sendDataToGAS(reader.result, file.type);
      reader.onerror = () => {
        alert('写真の読み込みに失敗しました。');
        loader.classList.add('hidden');
      };
    } else {
      sendDataToGAS(null, null);
    }
  });

  async function sendDataToGAS(photoData, photoMimeType) {
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
    };

    await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain', },
    })
      .then(response => response.json())
      .then(data => {
        if (data.status === 'success') {
          alert('通報を受け付けました。ご協力ありがとうございます。');
          form.reset();
          imagePreview.style.display = 'none';
        } else {
          throw new Error(data.message || '不明なエラーが発生しました。');
        }
      })
      .catch(error => {
        console.error('送信エラー:', error);
        alert('送信に失敗しました。エラー: ' + error.message);
      })
      .finally(() => {
        loader.classList.add('hidden');
      });
  }
});


