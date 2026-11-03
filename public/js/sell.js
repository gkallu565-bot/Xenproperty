// Direct Firestore controller for the short List Property form.
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('listPropertyForm');
  if (!form) return;

  // Listing is a protected seller area. Signed-out visitors may browse the
  // catalogue, but this page must not be available until they use Login.
  const sessionUser = api.getCurrentUser();
  const canList = sessionUser && ['seller', 'agent', 'admin'].includes(String(sessionUser.role || '').toLowerCase());
  if (!sessionUser || !api.getToken()) {
    showToast('Please login first. Only logged-in users can list a property.', 'error');
    setTimeout(() => { window.location.href = 'login.html?redirect=sell.html'; }, 900);
    return;
  }
  if (!canList) {
    showToast('Only Seller / Owner accounts can list a property.', 'error');
    form.innerHTML = '<div style="padding:28px;text-align:center;color:#36564d;font-weight:700;">Property listing is available only for Seller / Owner accounts.<br><a href="profile.html" style="display:inline-block;margin-top:14px;color:#075743;">Go to my profile</a></div>';
    setTimeout(() => { window.location.href = 'profile.html'; }, 1800);
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const currentUser = typeof api !== 'undefined' ? api.getCurrentUser() : null;
    const token = typeof api !== 'undefined' ? api.getToken() : null;
    if (!currentUser || !token || !['seller', 'agent', 'admin'].includes(String(currentUser.role || '').toLowerCase())) {
      showToast('Please login before listing your property.', 'error');
      setTimeout(() => { window.location.href = 'login.html?redirect=sell.html'; }, 900);
      return;
    }

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
       const photoUrl = await uploadOptionalMedia(form.elements.photo?.files?.[0], currentUser.id, 'photo');
       const videoUrl = await uploadOptionalMedia(form.elements.video?.files?.[0], currentUser.id, 'video');
      await firestoreDirect.create('pending_properties', {
        user_id: currentUser.id || null,
        seller_name: currentUser.full_name || '',
        seller_email: currentUser.email || '',
        seller_phone: currentUser.phone || '',
        title: 'New Property Listing', listing_type: data.get('listing_type') === 'rent' ? 'rent' : 'buy', property_type: 'Apartment',
        price: Number(data.get('price')),
        price_display: `₹${Number(data.get('price')).toLocaleString('en-IN')}`,
        city: 'India', state: 'India', address: String(data.get('address') || '').trim(),
         pincode, image_url: photoUrl, video_url: videoUrl, status: 'pending', beds: 0, baths: 0, area_sqft: 1000,
        ai_match_pct: 92, is_verified: true, is_featured: false,
      });
       showToast('🎉 Property submitted for manager verification.', 'success');
      setTimeout(() => { window.location.href = 'buy.html'; }, 1500);
    } catch (error) {
      showToast(error.message, 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Submit for Admin Approval <i class="fa-solid fa-paper-plane"></i>';
    }
  });
});

function selectListingKind(kind) {
  const input = document.getElementById('listingType');
  if (input) input.value = kind === 'rent' ? 'rent' : 'buy';
  document.querySelectorAll('.listing-kind-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.kind === input.value);
    button.setAttribute('aria-pressed', button.dataset.kind === input.value ? 'true' : 'false');
  });
}

window.selectListingKind = selectListingKind;

async function uploadOptionalMedia(file, userId, kind) {
  if (!file) return '';
  if (!window.firebase?.storage) throw new Error('Firebase Storage is not available. Please enable Storage for this project.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `properties/${userId}/${Date.now()}-${kind}-${safeName}`;
  const snapshot = await firebase.storage().ref(path).put(file, { contentType: file.type || 'application/octet-stream' });
  return snapshot.ref.getDownloadURL();
}
