/* ============================================================================
   mortgage-calculator.js — High-Precision California Luxury Mortgage Engine
   Steven Lenz Jr. | Compass Real Estate
   ============================================================================ */

(function () {
  'use strict';

  // Bay Area Conforming High-Balance Loan Limit (2024-2026)
  var BAY_AREA_CONFORMING_LIMIT = 1149825;
  var CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 70; // r=70 -> 439.82297

  // California County Base Property Tax Rates (including local bonds)
  var COUNTY_TAX_RATES = {
    'alameda': 0.0118,      // 1.18% (Pleasanton, Livermore, Dublin, Fremont, Oakland, Berkeley)
    'contracosta': 0.0115,  // 1.15% (Danville, Alamo, Walnut Creek, San Ramon, Lafayette)
    'santaclara': 0.0120,   // 1.20% (Palo Alto, San Jose, Los Altos)
    'sanmateo': 0.0116,     // 1.16% (Burlingame, Menlo Park, San Mateo)
    'sanfrancisco': 0.0118, // 1.18% (San Francisco County)
    'custom': 0.0118
  };

  // Default Loan Program Terms & Typical Interest Rates
  var LOAN_PROGRAMS = {
    '30fixed': { years: 30, rate: 6.65, label: '30-Year Fixed' },
    '20fixed': { years: 20, rate: 6.35, label: '20-Year Fixed' },
    '15fixed': { years: 15, rate: 5.95, label: '15-Year Fixed' },
    '7arm':    { years: 30, rate: 6.20, label: '7/1 ARM (30-Yr Amortization)' },
    '5arm':    { years: 30, rate: 6.10, label: '5/1 ARM (30-Yr Amortization)' },
    '10arm':   { years: 30, rate: 6.40, label: '10/1 ARM (30-Yr Amortization)' }
  };

  // State
  var state = {
    homePrice: 1850000,
    downPaymentPct: 20,
    downPaymentAmt: 370000,
    loanProgram: '30fixed',
    loanYears: 30,
    interestRate: 6.65,
    county: 'alameda',
    propertyTaxRate: 0.0118,
    monthlyTaxOverride: null,
    homeInsuranceAnnual: 2400,
    monthlyHoa: 150,
    extraMonthly: 0,
    viewMode: 'annual' // 'annual' | 'monthly'
  };

  // Helpers
  function formatMoney(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function formatPercent(n) {
    return Number(n).toFixed(2).replace(/\.00$/, '') + '%';
  }

  function parseCurrency(str) {
    if (typeof str === 'number') return str;
    var num = parseFloat(String(str).replace(/[^0-9.]/g, ''));
    return isNaN(num) ? 0 : num;
  }

  // Calculate monthly principal and interest
  function calcMonthlyPI(principal, annualRatePct, years) {
    if (principal <= 0) return 0;
    var r = (annualRatePct / 100) / 12;
    var n = years * 12;
    if (r === 0) return principal / n;
    return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  // Calculate monthly PMI (Private Mortgage Insurance)
  // Conventional PMI applies when down payment < 20% (LTV > 80%).
  function calcMonthlyPMI(homePrice, downAmt, loanAmt) {
    if (homePrice <= 0 || loanAmt <= 0) return 0;
    var downPct = (downAmt / homePrice) * 100;
    if (downPct >= 20) return 0;
    // Tiered PMI factor based on LTV
    var annualPmiFactor = downPct < 10 ? 0.0078 : downPct < 15 ? 0.0058 : 0.0042;
    return (loanAmt * annualPmiFactor) / 12;
  }

  // Calculate Amortization with optional extra payment
  function computeAmortizationSchedule(loanAmount, annualRatePct, years, extraMonthly) {
    var monthlyRate = (annualRatePct / 100) / 12;
    var scheduledPayment = calcMonthlyPI(loanAmount, annualRatePct, years);
    var balance = loanAmount;
    var monthlyRows = [];
    var annualRows = [];
    var totalInterest = 0;
    var totalPrincipal = 0;

    var curYear = 1;
    var yearPrincipal = 0;
    var yearInterest = 0;
    var yearTotal = 0;

    var month = 1;
    var maxMonths = years * 12;

    while (balance > 0.01 && month <= maxMonths) {
      var interestPayment = balance * monthlyRate;
      var principalPortion = scheduledPayment - interestPayment;
      var actualExtra = Math.min(extraMonthly, Math.max(0, balance - principalPortion));
      var totalPrincipalPayment = principalPortion + actualExtra;

      if (totalPrincipalPayment > balance) {
        totalPrincipalPayment = balance;
      }

      var totalPaidThisMonth = interestPayment + totalPrincipalPayment;
      balance = Math.max(0, balance - totalPrincipalPayment);

      totalInterest += interestPayment;
      totalPrincipal += totalPrincipalPayment;

      yearPrincipal += totalPrincipalPayment;
      yearInterest += interestPayment;
      yearTotal += totalPaidThisMonth;

      monthlyRows.push({
        month: month,
        year: Math.ceil(month / 12),
        payment: totalPaidThisMonth,
        principal: totalPrincipalPayment,
        interest: interestPayment,
        balance: balance
      });

      if (month % 12 === 0 || balance <= 0.01) {
        annualRows.push({
          year: curYear,
          principal: yearPrincipal,
          interest: yearInterest,
          payment: yearTotal,
          balance: balance
        });
        curYear++;
        yearPrincipal = 0;
        yearInterest = 0;
        yearTotal = 0;
      }

      if (balance <= 0.01) break;
      month++;
    }

    return {
      monthlyRows: monthlyRows,
      annualRows: annualRows,
      monthsToPayoff: monthlyRows.length,
      totalInterest: totalInterest,
      totalPaid: totalPrincipal + totalInterest
    };
  }

  // DOM Elements cache
  var els = {};

  function initElements() {
    els.homePriceInput = document.getElementById('mc-price-input');
    els.homePriceSlider = document.getElementById('mc-price-slider');
    els.downAmtInput = document.getElementById('mc-down-amt');
    els.downPctInput = document.getElementById('mc-down-pct');
    els.downSlider = document.getElementById('mc-down-slider');
    els.loanProgramSelect = document.getElementById('mc-loan-program');
    els.rateInput = document.getElementById('mc-rate-input');
    els.rateSlider = document.getElementById('mc-rate-slider');
    els.countySelect = document.getElementById('mc-county-select');
    els.taxInput = document.getElementById('mc-tax-input');
    els.insInput = document.getElementById('mc-ins-input');
    els.hoaInput = document.getElementById('mc-hoa-input');
    els.extraInput = document.getElementById('mc-extra-input');
    els.extraSlider = document.getElementById('mc-extra-slider');

    // Outputs
    els.totalPayment = document.getElementById('mc-total-payment');
    els.loanTierBadge = document.getElementById('mc-loan-tier-badge');
    els.pmiBadge = document.getElementById('mc-pmi-badge');
    els.loanAmountDisplay = document.getElementById('mc-loan-amount-display');

    // Chart & Bars
    els.donutPI = document.getElementById('mc-donut-pi');
    els.donutTax = document.getElementById('mc-donut-tax');
    els.donutIns = document.getElementById('mc-donut-ins');
    els.donutHOA = document.getElementById('mc-donut-hoa');
    els.donutPMI = document.getElementById('mc-donut-pmi');

    els.barPI = document.getElementById('mc-bar-pi');
    els.barTax = document.getElementById('mc-bar-tax');
    els.barIns = document.getElementById('mc-bar-ins');
    els.barHOA = document.getElementById('mc-bar-hoa');
    els.barPMI = document.getElementById('mc-bar-pmi');

    // Breakdown list values
    els.valPI = document.getElementById('mc-val-pi');
    els.pctPI = document.getElementById('mc-pct-pi');
    els.valTax = document.getElementById('mc-val-tax');
    els.pctTax = document.getElementById('mc-pct-tax');
    els.valIns = document.getElementById('mc-val-ins');
    els.pctIns = document.getElementById('mc-pct-ins');
    els.valHOA = document.getElementById('mc-val-hoa');
    els.pctHOA = document.getElementById('mc-pct-hoa');
    els.valPMI = document.getElementById('mc-val-pmi');
    els.pctPMI = document.getElementById('mc-pct-pmi');
    els.rowPMI = document.getElementById('mc-row-pmi');

    // Amortization output
    els.timeSavedDisplay = document.getElementById('mc-time-saved');
    els.interestSavedDisplay = document.getElementById('mc-interest-saved');
    els.totalInterestDisplay = document.getElementById('mc-total-interest');
    els.amortTableBody = document.getElementById('mc-amort-tbody');
    els.tableColPeriod = document.getElementById('mc-col-period');
    els.btnToggleAnnual = document.getElementById('mc-toggle-annual');
    els.btnToggleMonthly = document.getElementById('mc-toggle-monthly');
    els.btnExportCsv = document.getElementById('mc-export-csv');

    // Quick chips & buttons
    els.tierButtons = document.querySelectorAll('.mc-tier-btn');
    els.downChips = document.querySelectorAll('.mc-chip');
  }

  // Update SVG Donut chart segments
  function updateDonut(parts, total) {
    if (total <= 0) return;
    var C = CIRCLE_CIRCUMFERENCE;
    var currentOffset = 0;

    var segs = [
      { el: els.donutPI, val: parts.pi },
      { el: els.donutTax, val: parts.tax },
      { el: els.donutIns, val: parts.ins },
      { el: els.donutHOA, val: parts.hoa },
      { el: els.donutPMI, val: parts.pmi }
    ];

    segs.forEach(function (s) {
      if (!s.el) return;
      var pct = s.val / total;
      var dash = pct * C;
      s.el.style.strokeDasharray = dash + ' ' + (C - dash);
      s.el.style.strokeDashoffset = -currentOffset;
      currentOffset += dash;
    });
  }

  // Update proportion progress bar
  function updateProgressBar(parts, total) {
    if (total <= 0) return;
    var pPI = ((parts.pi / total) * 100).toFixed(1) + '%';
    var pTax = ((parts.tax / total) * 100).toFixed(1) + '%';
    var pIns = ((parts.ins / total) * 100).toFixed(1) + '%';
    var pHOA = ((parts.hoa / total) * 100).toFixed(1) + '%';
    var pPMI = ((parts.pmi / total) * 100).toFixed(1) + '%';

    if (els.barPI) els.barPI.style.width = pPI;
    if (els.barTax) els.barTax.style.width = pTax;
    if (els.barIns) els.barIns.style.width = pIns;
    if (els.barHOA) els.barHOA.style.width = pHOA;
    if (els.barPMI) els.barPMI.style.width = pPMI;
  }

  // Main Calculation Routine
  function recalculate() {
    var price = state.homePrice;
    var downAmt = state.downPaymentAmt;
    var loanAmt = Math.max(0, price - downAmt);
    var rate = state.interestRate;
    var years = state.loanYears;

    // Monthly components
    var monthlyPI = calcMonthlyPI(loanAmt, rate, years);
    var monthlyTax = (price * state.propertyTaxRate) / 12;
    var monthlyIns = state.homeInsuranceAnnual / 12;
    var monthlyHoa = state.monthlyHoa;
    var monthlyPmi = calcMonthlyPMI(price, downAmt, loanAmt);

    var totalMonthly = monthlyPI + monthlyTax + monthlyIns + monthlyHoa + monthlyPmi;

    // 1. Update Hero Payment Display
    if (els.totalPayment) {
      els.totalPayment.textContent = formatMoney(totalMonthly);
    }

    if (els.loanAmountDisplay) {
      els.loanAmountDisplay.textContent = 'Financing ' + formatMoney(loanAmt) + ' (' + formatPercent(100 - state.downPaymentPct) + ')';
    }

    // 2. Conforming vs. Jumbo Classification Badge
    if (els.loanTierBadge) {
      if (loanAmt === 0) {
        els.loanTierBadge.className = 'mc-badge mc-badge--conforming';
        els.loanTierBadge.textContent = '✓ All-Cash Transaction (No Financing)';
      } else if (loanAmt > BAY_AREA_CONFORMING_LIMIT) {
        els.loanTierBadge.className = 'mc-badge mc-badge--jumbo';
        els.loanTierBadge.innerHTML = '★ Jumbo Loan Tier (' + formatMoney(loanAmt) + ' exceeds ' + formatMoney(BAY_AREA_CONFORMING_LIMIT) + ' Bay Area limit)';
      } else {
        els.loanTierBadge.className = 'mc-badge mc-badge--conforming';
        els.loanTierBadge.innerHTML = '✓ Conforming High-Balance Tier (Under ' + formatMoney(BAY_AREA_CONFORMING_LIMIT) + ' limit)';
      }
    }

    // 3. PMI Status Badge
    if (els.pmiBadge) {
      if (monthlyPmi > 0) {
        els.pmiBadge.className = 'mc-badge mc-badge--pmi-active';
        els.pmiBadge.innerHTML = '⚠ PMI Required: ' + formatMoney(monthlyPmi) + '/mo (Down payment < 20%)';
        if (els.rowPMI) els.rowPMI.hidden = false;
      } else {
        els.pmiBadge.className = 'mc-badge mc-badge--pmi-zero';
        els.pmiBadge.innerHTML = '✓ 0% PMI (20%+ Down Payment Satisfied)';
        if (els.rowPMI) els.rowPMI.hidden = true;
      }
    }

    // 4. Breakdown Items
    var parts = {
      pi: monthlyPI,
      tax: monthlyTax,
      ins: monthlyIns,
      hoa: monthlyHoa,
      pmi: monthlyPmi
    };

    if (els.valPI) els.valPI.textContent = formatMoney(monthlyPI);
    if (els.pctPI) els.pctPI.textContent = totalMonthly ? ((monthlyPI / totalMonthly) * 100).toFixed(0) + '%' : '0%';

    if (els.valTax) els.valTax.textContent = formatMoney(monthlyTax);
    if (els.pctTax) els.pctTax.textContent = totalMonthly ? ((monthlyTax / totalMonthly) * 100).toFixed(0) + '%' : '0%';

    if (els.valIns) els.valIns.textContent = formatMoney(monthlyIns);
    if (els.pctIns) els.pctIns.textContent = totalMonthly ? ((monthlyIns / totalMonthly) * 100).toFixed(0) + '%' : '0%';

    if (els.valHOA) els.valHOA.textContent = formatMoney(monthlyHoa);
    if (els.pctHOA) els.pctHOA.textContent = totalMonthly ? ((monthlyHoa / totalMonthly) * 100).toFixed(0) + '%' : '0%';

    if (els.valPMI) els.valPMI.textContent = formatMoney(monthlyPmi);
    if (els.pctPMI) els.pctPMI.textContent = totalMonthly ? ((monthlyPmi / totalMonthly) * 100).toFixed(0) + '%' : '0%';

    // 5. Update Visual Charts
    updateDonut(parts, totalMonthly);
    updateProgressBar(parts, totalMonthly);

    // 6. Amortization and Extra Payment Simulator
    var schedStandard = computeAmortizationSchedule(loanAmt, rate, years, 0);
    var schedExtra = computeAmortizationSchedule(loanAmt, rate, years, state.extraMonthly);

    var monthsSaved = Math.max(0, schedStandard.monthsToPayoff - schedExtra.monthsToPayoff);
    var interestSaved = Math.max(0, schedStandard.totalInterest - schedExtra.totalInterest);

    var yearsSavedText = Math.floor(monthsSaved / 12);
    var remMonths = monthsSaved % 12;
    var timeSavedStr = '';
    if (yearsSavedText > 0 && remMonths > 0) {
      timeSavedStr = yearsSavedText + ' yrs, ' + remMonths + ' mos';
    } else if (yearsSavedText > 0) {
      timeSavedStr = yearsSavedText + ' years';
    } else if (remMonths > 0) {
      timeSavedStr = remMonths + ' months';
    } else {
      timeSavedStr = '0 months';
    }

    if (els.timeSavedDisplay) {
      els.timeSavedDisplay.textContent = state.extraMonthly > 0 ? timeSavedStr + ' shaved off' : '0 months';
    }
    if (els.interestSavedDisplay) {
      els.interestSavedDisplay.textContent = state.extraMonthly > 0 ? formatMoney(interestSaved) + ' saved' : '$0';
    }
    if (els.totalInterestDisplay) {
      els.totalInterestDisplay.textContent = formatMoney(schedExtra.totalInterest);
    }

    // 7. Render Amortization Schedule Table
    renderAmortizationTable(schedExtra);
  }

  // Render Amortization Schedule Rows
  var currentScheduleData = null;

  function renderAmortizationTable(sched) {
    currentScheduleData = sched;
    if (!els.amortTableBody) return;

    var rows = state.viewMode === 'annual' ? sched.annualRows : sched.monthlyRows;
    if (els.tableColPeriod) {
      els.tableColPeriod.textContent = state.viewMode === 'annual' ? 'Year' : 'Month';
    }

    var html = '';
    // Show top 30 rows or all
    var max = rows.length;
    for (var i = 0; i < max; i++) {
      var r = rows[i];
      var period = state.viewMode === 'annual' ? 'Year ' + r.year : 'Mo ' + r.month + ' (Yr ' + r.year + ')';
      html += '<tr>' +
        '<td>' + period + '</td>' +
        '<td>' + formatMoney(r.principal) + '</td>' +
        '<td>' + formatMoney(r.interest) + '</td>' +
        '<td>' + formatMoney(r.payment) + '</td>' +
        '<td>' + formatMoney(r.balance) + '</td>' +
        '</tr>';
    }

    els.amortTableBody.innerHTML = html;
  }

  // Export Amortization Table to CSV
  function exportScheduleToCsv() {
    if (!currentScheduleData) return;
    var rows = state.viewMode === 'annual' ? currentScheduleData.annualRows : currentScheduleData.monthlyRows;
    var periodHeader = state.viewMode === 'annual' ? 'Year' : 'Month';

    var csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += periodHeader + ',Principal Paid,Interest Paid,Total Payment,Remaining Balance\r\n';

    rows.forEach(function (r) {
      var period = state.viewMode === 'annual' ? r.year : r.month;
      csvContent += period + ',' +
        Math.round(r.principal) + ',' +
        Math.round(r.interest) + ',' +
        Math.round(r.payment) + ',' +
        Math.round(r.balance) + '\r\n';
    });

    var encodedUri = encodeURI(csvContent);
    var link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'StevenLenzJr-Mortgage-Amortization-' + state.viewMode + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Sync helpers
  function syncHomePrice(val) {
    val = Math.max(100000, Math.min(20000000, Math.round(val)));
    state.homePrice = val;
    state.downPaymentAmt = Math.round(val * (state.downPaymentPct / 100));

    if (els.homePriceInput) els.homePriceInput.value = val.toLocaleString('en-US');
    if (els.homePriceSlider) els.homePriceSlider.value = val;
    if (els.downAmtInput) els.downAmtInput.value = state.downPaymentAmt.toLocaleString('en-US');

    // Update property tax estimate
    var estTax = (val * state.propertyTaxRate) / 12;
    if (els.taxInput) els.taxInput.value = Math.round(estTax).toLocaleString('en-US');

    // Update insurance estimate (approx $1.30 per $1,000 value in CA hazard areas)
    var estIns = Math.round((val * 0.0013));
    state.homeInsuranceAnnual = estIns;
    if (els.insInput) els.insInput.value = Math.round(estIns / 12).toLocaleString('en-US');

    // Update tier buttons active state
    if (els.tierButtons) {
      els.tierButtons.forEach(function (btn) {
        var bVal = parseCurrency(btn.getAttribute('data-price'));
        btn.classList.toggle('is-active', bVal === val);
      });
    }

    recalculate();
  }

  function syncDownPaymentByAmt(amt) {
    amt = Math.max(0, Math.min(state.homePrice, Math.round(amt)));
    state.downPaymentAmt = amt;
    state.downPaymentPct = state.homePrice > 0 ? (amt / state.homePrice) * 100 : 0;

    if (els.downAmtInput) els.downAmtInput.value = amt.toLocaleString('en-US');
    if (els.downPctInput) els.downPctInput.value = state.downPaymentPct.toFixed(1).replace(/\.0$/, '');
    if (els.downSlider) els.downSlider.value = state.downPaymentPct;

    // Check down chips
    if (els.downChips) {
      els.downChips.forEach(function (chip) {
        var cPct = parseFloat(chip.getAttribute('data-pct'));
        chip.classList.toggle('is-active', Math.abs(cPct - state.downPaymentPct) < 0.2);
      });
    }

    recalculate();
  }

  function syncDownPaymentByPct(pct) {
    pct = Math.max(0, Math.min(100, parseFloat(pct) || 0));
    state.downPaymentPct = pct;
    state.downPaymentAmt = Math.round(state.homePrice * (pct / 100));

    if (els.downPctInput) els.downPctInput.value = pct.toFixed(1).replace(/\.0$/, '');
    if (els.downAmtInput) els.downAmtInput.value = state.downPaymentAmt.toLocaleString('en-US');
    if (els.downSlider) els.downSlider.value = pct;

    if (els.downChips) {
      els.downChips.forEach(function (chip) {
        var cPct = parseFloat(chip.getAttribute('data-pct'));
        chip.classList.toggle('is-active', Math.abs(cPct - pct) < 0.2);
      });
    }

    recalculate();
  }

  function syncInterestRate(rate) {
    rate = Math.max(1.0, Math.min(15.0, parseFloat(rate) || 0));
    state.interestRate = rate;

    if (els.rateInput) els.rateInput.value = rate.toFixed(2);
    if (els.rateSlider) els.rateSlider.value = rate;

    recalculate();
  }

  function syncExtraPayment(amt) {
    amt = Math.max(0, Math.min(10000, Math.round(amt)));
    state.extraMonthly = amt;

    if (els.extraInput) els.extraInput.value = amt.toLocaleString('en-US');
    if (els.extraSlider) els.extraSlider.value = amt;

    recalculate();
  }

  // Event Listeners Wire-up
  function attachEvents() {
    // 1. Home Price
    if (els.homePriceInput) {
      els.homePriceInput.addEventListener('change', function () {
        syncHomePrice(parseCurrency(els.homePriceInput.value));
      });
      els.homePriceInput.addEventListener('blur', function () {
        syncHomePrice(parseCurrency(els.homePriceInput.value));
      });
    }
    if (els.homePriceSlider) {
      els.homePriceSlider.addEventListener('input', function () {
        syncHomePrice(parseFloat(els.homePriceSlider.value));
      });
    }

    // Quick Price Tiers
    if (els.tierButtons) {
      els.tierButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var p = parseCurrency(btn.getAttribute('data-price'));
          syncHomePrice(p);
        });
      });
    }

    // 2. Down Payment
    if (els.downAmtInput) {
      els.downAmtInput.addEventListener('change', function () {
        syncDownPaymentByAmt(parseCurrency(els.downAmtInput.value));
      });
      els.downAmtInput.addEventListener('blur', function () {
        syncDownPaymentByAmt(parseCurrency(els.downAmtInput.value));
      });
    }
    if (els.downPctInput) {
      els.downPctInput.addEventListener('change', function () {
        syncDownPaymentByPct(els.downPctInput.value);
      });
      els.downPctInput.addEventListener('blur', function () {
        syncDownPaymentByPct(els.downPctInput.value);
      });
    }
    if (els.downSlider) {
      els.downSlider.addEventListener('input', function () {
        syncDownPaymentByPct(els.downSlider.value);
      });
    }

    // Quick Down Payment Chips
    if (els.downChips) {
      els.downChips.forEach(function (chip) {
        chip.addEventListener('click', function () {
          var pct = parseFloat(chip.getAttribute('data-pct'));
          syncDownPaymentByPct(pct);
        });
      });
    }

    // 3. Loan Program Select
    if (els.loanProgramSelect) {
      els.loanProgramSelect.addEventListener('change', function () {
        var key = els.loanProgramSelect.value;
        var prog = LOAN_PROGRAMS[key];
        if (prog) {
          state.loanProgram = key;
          state.loanYears = prog.years;
          syncInterestRate(prog.rate);
        }
      });
    }

    // 4. Interest Rate
    if (els.rateInput) {
      els.rateInput.addEventListener('change', function () {
        syncInterestRate(els.rateInput.value);
      });
    }
    if (els.rateSlider) {
      els.rateSlider.addEventListener('input', function () {
        syncInterestRate(els.rateSlider.value);
      });
    }

    // 5. County Property Tax Preset
    if (els.countySelect) {
      els.countySelect.addEventListener('change', function () {
        var c = els.countySelect.value;
        state.county = c;
        if (COUNTY_TAX_RATES[c]) {
          state.propertyTaxRate = COUNTY_TAX_RATES[c];
          var estTax = (state.homePrice * state.propertyTaxRate) / 12;
          if (els.taxInput) els.taxInput.value = Math.round(estTax).toLocaleString('en-US');
          recalculate();
        }
      });
    }

    // Custom Monthly Property Tax Override
    if (els.taxInput) {
      els.taxInput.addEventListener('change', function () {
        var val = parseCurrency(els.taxInput.value);
        if (state.homePrice > 0) {
          state.propertyTaxRate = (val * 12) / state.homePrice;
        }
        recalculate();
      });
    }

    // 6. Homeowners Insurance
    if (els.insInput) {
      els.insInput.addEventListener('change', function () {
        var m = parseCurrency(els.insInput.value);
        state.homeInsuranceAnnual = m * 12;
        recalculate();
      });
    }

    // 7. HOA Dues
    if (els.hoaInput) {
      els.hoaInput.addEventListener('change', function () {
        state.monthlyHoa = parseCurrency(els.hoaInput.value);
        recalculate();
      });
    }

    // 8. Extra Payment
    if (els.extraInput) {
      els.extraInput.addEventListener('change', function () {
        syncExtraPayment(parseCurrency(els.extraInput.value));
      });
    }
    if (els.extraSlider) {
      els.extraSlider.addEventListener('input', function () {
        syncExtraPayment(parseFloat(els.extraSlider.value));
      });
    }

    // 9. Amortization Table Toggle
    if (els.btnToggleAnnual && els.btnToggleMonthly) {
      els.btnToggleAnnual.addEventListener('click', function () {
        state.viewMode = 'annual';
        els.btnToggleAnnual.classList.add('is-active');
        els.btnToggleMonthly.classList.remove('is-active');
        recalculate();
      });

      els.btnToggleMonthly.addEventListener('click', function () {
        state.viewMode = 'monthly';
        els.btnToggleMonthly.classList.add('is-active');
        els.btnToggleAnnual.classList.remove('is-active');
        recalculate();
      });
    }

    // 10. CSV Export Button
    if (els.btnExportCsv) {
      els.btnExportCsv.addEventListener('click', exportScheduleToCsv);
    }

    // 11. FAQ Accordion Items
    document.querySelectorAll('.mc-faq-question').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.closest('.mc-faq-item');
        if (item) {
          item.classList.toggle('is-open');
        }
      });
    });

    // 12. Lead Advisory Modal Pre-fill & Trigger
    var advBtn = document.getElementById('mc-advisory-btn');
    if (advBtn) {
      advBtn.addEventListener('click', function () {
        var scenario = 'Mortgage Calculation Scenario: Home Price ' + formatMoney(state.homePrice) +
          ', Down Payment ' + formatMoney(state.downPaymentAmt) + ' (' + state.downPaymentPct.toFixed(1) + '%), ' +
          LOAN_PROGRAMS[state.loanProgram].label + ' at ' + state.interestRate + '%. ' +
          'Estimated Monthly: ' + (els.totalPayment ? els.totalPayment.textContent : '') + '.';

        // Open chat / concierge or pre-fill connect form
        var leadNote = document.getElementById('mc-adv-note');
        if (leadNote) {
          leadNote.value = scenario;
        }
        var modal = document.getElementById('mc-lead-dialog');
        if (modal && typeof modal.showModal === 'function') {
          modal.showModal();
        } else {
          window.location.href = '/connect?note=' + encodeURIComponent(scenario);
        }
      });
    }

    // Advisory Modal Form
    var leadForm = document.getElementById('mc-adv-form');
    if (leadForm) {
      leadForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = (document.getElementById('mc-lead-name') || {}).value || '';
        var email = (document.getElementById('mc-lead-email') || {}).value || '';
        var phone = (document.getElementById('mc-lead-phone') || {}).value || '';
        var note = (document.getElementById('mc-adv-note') || {}).value || '';
        var status = document.getElementById('mc-lead-status');

        if (!name || !email) {
          if (status) {
            status.hidden = false;
            status.textContent = 'Please enter your name and email.';
          }
          return;
        }

        var done = window.SLForms ? window.SLForms.busy(leadForm) : function () {};
        if (window.SLForms) {
          window.SLForms.post('/api/lead', {
            name: name,
            email: email,
            phone: phone,
            interest: 'Mortgage Advisory / Pre-Approval',
            message: note,
            source_page: window.location.pathname,
            scene: 'mortgage-calculator'
          }).then(function () {
            if (status) {
              window.SLForms.show(status, 'Thank you, ' + name + '. Steven Lenz Jr. has received your mortgage financing request and will connect you with our private client lending partners shortly.', false);
            }
            leadForm.reset();
          }).catch(function (err) {
            if (status) window.SLForms.show(status, err.message, true);
          }).then(done);
        }
      });
    }

    var leadCloseBtn = document.getElementById('mc-lead-close');
    if (leadCloseBtn) {
      leadCloseBtn.addEventListener('click', function () {
        var modal = document.getElementById('mc-lead-dialog');
        if (modal) modal.close();
      });
    }
  }

  // Initialize
  function init() {
    initElements();
    attachEvents();
    syncHomePrice(state.homePrice);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
