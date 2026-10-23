// Sell / List Property Form Controller
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('listPropertyForm');
  if (!form) return;

  const fileInput = document.getElementById('propImageFile');
  const previewImg = document.getElementById('imagePreview');

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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;
    if (!hasFile) {
      showToast('Please upload a property photo.', 'error');
      return;
    }
    if (fileInput.files[0].size > 700 * 1024) {
      showToast('Photo must be smaller than 700 KB.', 'error');
      return;
    }

    const pincode = form.elements.pincode ? form.elements.pincode.value.trim() : '';
    if (!/^\d{6}$/.test(pincode)) {
      showToast('Please enter a valid 6-digit pincode.', 'error');
      return;
    }

    const submitBtn = document.getElementById('submitPropBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting to AI Ecosystem...';

    try {
      const formData = new FormData(form);
      const imageUrl = await readSellImage(fileInput.files[0]);
      const user = typeof api !== 'undefined' ? api.getCurrentUser() : null;
      await firestoreDirect.create('properties', {
        user_id: user?.id || null,
        title: 'New Property Listing',
        listing_type: 'buy',
        property_type: 'Apartment',
        price: Number(formData.get('price')),
        price_display: `₹${Number(formData.get('price')).toLocaleString('en-IN')}`,
        city: 'India',
        state: 'India',
        address: String(formData.get('address') || '').trim(),
        pincode: String(formData.get('pincode') || '').trim(),
        image_url: imageUrl,
        beds: 0,
        baths: 0,
        area_sqft: 1000,
        ai_match_pct: 92,
        is_verified: true,
        is_featured: false,
      });
      showToast('🎉 Property saved directly to Firestore!', 'success');
      
      setTimeout(() => {
        window.location.href = 'buy.html';
      }, 1500);
    } catch (err) {
      showToast(err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Publish Property Listing <i class="fa-solid fa-arrow-right"></i>';
    }
  });
});

function readSellImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected photo.'));
    reader.readAsDataURL(file);
  });
}
