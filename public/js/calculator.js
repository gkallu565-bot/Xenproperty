// Home Loan Calculator & Application Controller
document.addEventListener('DOMContentLoaded', () => {
  initCalculator();
  initLoanApplication();
});

function initCalculator() {
  const amountSlider = document.getElementById('loanAmountSlider');
  const rateSlider = document.getElementById('interestRateSlider');
  const tenureSlider = document.getElementById('tenureSlider');

  if (amountSlider && rateSlider && tenureSlider) {
    [amountSlider, rateSlider, tenureSlider].forEach(slider => {
      slider.addEventListener('input', calculateEMI);
    });
    calculateEMI();
  }
}

function calculateEMI() {
  const P = Number(document.getElementById('loanAmountSlider').value);
  const annualRate = Number(document.getElementById('interestRateSlider').value);
  const years = Number(document.getElementById('tenureSlider').value);

  // Update text values
  document.getElementById('loanAmountVal').innerText = `₹${(P / 100000).toFixed(1)} Lakh`;
  document.getElementById('interestRateVal').innerText = `${annualRate.toFixed(2)}%`;
  document.getElementById('tenureVal').innerText = `${years} Years`;

  const r = annualRate / 12 / 100;
  const n = years * 12;

  // EMI formula: P * r * (1+r)^n / ((1+r)^n - 1)
  const emi = Math.round((P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
  const totalPayment = emi * n;
  const totalInterest = totalPayment - P;

  document.getElementById('monthlyEMIVal').innerText = `₹${emi.toLocaleString('en-IN')}`;
  document.getElementById('principalAmountDisplay').innerText = `₹${P.toLocaleString('en-IN')}`;
  document.getElementById('totalInterestDisplay').innerText = `₹${totalInterest.toLocaleString('en-IN')}`;
  document.getElementById('totalPayableDisplay').innerText = `₹${totalPayment.toLocaleString('en-IN')}`;

  // Visual proportion bar
  const principalPct = Math.round((P / totalPayment) * 100);
  const interestPct = 100 - principalPct;
  const bar = document.getElementById('emiProportionBar');
  if (bar) {
    bar.style.background = `linear-gradient(90deg, #10b981 0%, #10b981 ${principalPct}%, #f59e0b ${principalPct}%, #f59e0b 100%)`;
  }
}

function initLoanApplication() {
  const form = document.getElementById('loanApplyForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitLoanBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing Digital KYC...';

    try {
      const data = {
        full_name: document.getElementById('loanFullName').value,
        email: document.getElementById('loanEmail').value,
        phone: document.getElementById('loanPhone').value,
        loan_amount: Number(document.getElementById('loanReqAmount').value),
        monthly_income: Number(document.getElementById('loanMonthlyIncome').value),
        property_city: document.getElementById('loanCity').value,
        employment_type: document.getElementById('loanEmployment').value,
        bank_preference: document.getElementById('loanBankPref').value
      };

      const res = await api.applyLoan(data);
      btn.disabled = false;
      btn.innerHTML = 'Submit Instant Application <i class="fa-solid fa-arrow-right"></i>';

      const resultBox = document.getElementById('loanApprovalStatus');
      if (resultBox) {
        resultBox.style.display = 'block';
        resultBox.innerHTML = `
          <div style="background:#ecfdf5; border:1px solid #10b981; border-radius:12px; padding:20px; text-align:center;">
            <i class="fa-solid fa-circle-check" style="font-size:2rem; color:#10b981; margin-bottom:8px;"></i>
            <h4 style="font-size:1.15rem; font-weight:800; color:#065f46;">Pre-Approval Letter Issued!</h4>
            <p style="font-size:0.85rem; color:#047857; margin-top:4px;">
              Based on your monthly income of ₹${Number(data.monthly_income).toLocaleString('en-IN')}, you are eligible for up to <strong>₹${Number(res.eligibility.maxEligibleAmount).toLocaleString('en-IN')}</strong>.
            </p>
            <div style="margin-top:10px; font-size:0.8rem; color:#4b5563;">
              Reference ID: <strong>XP-LN-${res.applicationId}</strong>. A dedicated relationship manager from ${data.bank_preference} will contact you.
            </div>
          </div>
        `;
        resultBox.scrollIntoView({ behavior: 'smooth' });
      }

      showToast('🎉 Loan application pre-approved successfully!', 'success');
      form.reset();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Submit Instant Application <i class="fa-solid fa-arrow-right"></i>';
    }
  });
}
