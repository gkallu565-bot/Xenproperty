// Direct Firestore controller for the short List Property form.
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('listPropertyForm');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const pincode = String(form.elements.pincode?.value || '').trim();
    if (!/^\d{6}$/.test(pincode)) {
      showToast('Please enter a valid 6-digit pincode.', 'error');
      return;
    }

    const submitBtn = document.getElementById('submitPropBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving to Firestore...';
    try {
      const data = new FormData(form);
      const user = typeof api !== 'undefined' ? api.getCurrentUser() : null;
      await firestoreDirect.create('properties', {
        user_id: user?.id || null,
        title: 'New Property Listing', listing_type: 'buy', property_type: 'Apartment',
        price: Number(data.get('price')),
        price_display: `₹${Number(data.get('price')).toLocaleString('en-IN')}`,
        city: 'India', state: 'India', address: String(data.get('address') || '').trim(),
        pincode, image_url: '', beds: 0, baths: 0, area_sqft: 1000,
        ai_match_pct: 92, is_verified: true, is_featured: false,
      });
      showToast('🎉 Address, pincode and price saved directly to Firestore!', 'success');
      setTimeout(() => { window.location.href = 'buy.html'; }, 1500);
    } catch (error) {
      showToast(error.message, 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Publish Property Listing <i class="fa-solid fa-arrow-right"></i>';
    }
  });
});
