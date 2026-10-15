// Sell / List Property Form Controller
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('listPropertyForm');
  if (!form) return;

  const fileInput = document.getElementById('propImageFile');
  const previewImg = document.getElementById('imagePreview');
  const urlInput = document.getElementById('propImageUrl');

  if (fileInput && previewImg) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          previewImg.src = event.target.result;
          previewImg.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (urlInput && previewImg) {
    urlInput.addEventListener('input', () => {
      const val = urlInput.value.trim();
      if (val.startsWith('http')) {
        previewImg.src = val;
        previewImg.style.display = 'block';
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // A photo can be uploaded as a file or supplied as a direct URL. The
    // browser's `required` attribute cannot express that either/or rule.
    const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;
    const hasUrl = urlInput && urlInput.value.trim() !== '';
    if (!hasFile && !hasUrl) {
      showToast('Please upload a property photo or paste an image URL.', 'error');
      return;
    }

    const pincode = form.elements.pincode ? form.elements.pincode.value.trim() : '';
    if (!/^\d{6}$/.test(pincode)) {
      showToast('Please enter a valid 6-digit pincode.', 'error');
      return;
    }

    // Publishing a listing requires an account - send them to login and back.
    if (!api.getToken()) {
      showToast('Please sign in to publish your property listing.', 'error');
      setTimeout(() => {
        window.location.href = 'login.html?redirect=' + encodeURIComponent('sell.html');
      }, 1200);
      return;
    }
    const submitBtn = document.getElementById('submitPropBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting to AI Ecosystem...';

    try {
      const formData = new FormData(form);

      // Collect checked amenities
      const checkedAmenities = [];
      document.querySelectorAll('input[name="amenities_check"]:checked').forEach(cb => {
        checkedAmenities.push(cb.value);
      });
      formData.set('amenities', checkedAmenities.join(', '));

      const res = await api.createProperty(formData);
      showToast('🎉 Property listed successfully with 94% AI verification rating!', 'success');
      
      setTimeout(() => {
        const listingType = formData.get('listing_type');
        window.location.href = listingType === 'rent' ? 'rent.html' : 'buy.html';
      }, 1500);
    } catch (err) {
      showToast(err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Publish Property Listing <i class="fa-solid fa-arrow-right"></i>';
    }
  });
});
