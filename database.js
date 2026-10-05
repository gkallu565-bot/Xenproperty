const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'xenproperty.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite database:', err.message);
  } else {
    console.log('Connected to XenProperty SQLite database at', dbPath);
  }
});

const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

async function initDatabase() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone TEXT,
      role TEXT DEFAULT 'user',
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      listing_type TEXT NOT NULL,
      property_type TEXT NOT NULL,
      price INTEGER NOT NULL,
      price_display TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      address TEXT NOT NULL,
      beds INTEGER DEFAULT 0,
      baths INTEGER DEFAULT 0,
      area_sqft INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      additional_images TEXT,
      ai_match_pct INTEGER DEFAULT 92,
      location_score REAL DEFAULT 9.0,
      lifestyle_score REAL DEFAULT 90,
      description TEXT,
      amenities TEXT,
      furnishing TEXT DEFAULT 'Semi-Furnished',
      is_verified INTEGER DEFAULT 1,
      is_featured INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER,
      property_title TEXT,
      user_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      user_phone TEXT NOT NULL,
      visit_date TEXT,
      visit_time TEXT,
      visit_type TEXT DEFAULT 'in_person',
      message TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS loan_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      loan_amount INTEGER NOT NULL,
      monthly_income INTEGER NOT NULL,
      property_city TEXT NOT NULL,
      employment_type TEXT DEFAULT 'Salaried',
      bank_preference TEXT DEFAULT 'HDFC Bank',
      status TEXT DEFAULT 'Under Review',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS design_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      service_type TEXT NOT NULL,
      property_area INTEGER,
      budget_range TEXT,
      message TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default admin and user
  const userCount = await dbGet('SELECT COUNT(*) as count FROM users');
  if (userCount.count === 0) {
    const adminPassword = await bcrypt.hash('admin123', 10);
    const userPassword = await bcrypt.hash('user123', 10);

    await dbRun(
      'INSERT INTO users (full_name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, ?)',
      ['Admin XenProperty', 'admin@xenproperty.com', adminPassword, '+91 98765 43210', 'admin']
    );

    await dbRun(
      'INSERT INTO users (full_name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, ?)',
      ['Rahul Sharma', 'rahul@xenproperty.com', userPassword, '+91 98111 22334', 'user']
    );
    console.log('Seeded default users (Admin and User).');
  }

  // Seed properties
  const propCount = await dbGet('SELECT COUNT(*) as count FROM properties');
  if (propCount.count === 0) {
    const defaultProperties = [
      {
        title: 'The Green Residency',
        listing_type: 'buy',
        property_type: 'Villa',
        price: 12500000,
        price_display: '₹1.25 Cr',
        city: 'Bangalore',
        state: 'Karnataka',
        address: 'Sarjapur Main Road, Bangalore East',
        beds: 3,
        baths: 3,
        area_sqft: 1850,
        image_url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
        additional_images: JSON.stringify([
          'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=80'
        ]),
        ai_match_pct: 94,
        location_score: 9.2,
        lifestyle_score: 95,
        description: 'Spectacular architectural modern villa with infinity pool, smart solar integration, biophilic garden atrium, and private sundeck in prime Sarjapur, Bangalore.',
        amenities: JSON.stringify(['Private Pool', 'Solar Powered', 'Smart Home Automation', 'Vastu Compliant', '2 Covered Car Parks', 'Clubhouse & Gym']),
        furnishing: 'Fully Furnished',
        is_verified: 1,
        is_featured: 1
      },
      {
        title: 'Skyline Apartments',
        listing_type: 'buy',
        property_type: 'Apartment',
        price: 9800000,
        price_display: '₹98 Lakh',
        city: 'Mumbai',
        state: 'Maharashtra',
        address: 'Powai Lake Promenade, Mumbai',
        beds: 2,
        baths: 2,
        area_sqft: 1200,
        image_url: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80',
        additional_images: JSON.stringify([
          'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80'
        ]),
        ai_match_pct: 91,
        location_score: 8.9,
        lifestyle_score: 90,
        description: 'High-rise luxury residence overlooking serene waters in Powai. Featuring imported Italian marble, modular kitchen, and panoramic skyline vistas.',
        amenities: JSON.stringify(['Lake View', 'Rooftop Infinity Pool', '24x7 Security', 'EV Charging Station', 'High Speed Elevators']),
        furnishing: 'Semi-Furnished',
        is_verified: 1,
        is_featured: 1
      },
      {
        title: 'Royal Villa',
        listing_type: 'buy',
        property_type: 'Villa',
        price: 24000000,
        price_display: '₹2.4 Cr',
        city: 'Hyderabad',
        state: 'Telangana',
        address: 'Jubilee Hills, Road No. 36, Hyderabad',
        beds: 4,
        baths: 3,
        area_sqft: 3200,
        image_url: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1200&q=80',
        additional_images: JSON.stringify([
          'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?auto=format&fit=crop&w=1200&q=80'
        ]),
        ai_match_pct: 96,
        location_score: 9.5,
        lifestyle_score: 94,
        description: 'Elite designer villa nestled in prestigious Jubilee Hills with landscaped courtyard, double-height ceiling living hall, and designer Italian fittings.',
        amenities: JSON.stringify(['Private Lawn', 'Home Theater Room', 'Servant Quarters', 'Gated Community', 'Italian Marble Flooring']),
        furnishing: 'Fully Furnished',
        is_verified: 1,
        is_featured: 1
      },
      {
        title: 'Green Valley',
        listing_type: 'buy',
        property_type: 'Villa',
        price: 9500000,
        price_display: '₹95 Lakh',
        city: 'Bangalore',
        state: 'Karnataka',
        address: 'Hennur Road, North Bangalore',
        beds: 3,
        baths: 2,
        area_sqft: 1450,
        image_url: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80',
        additional_images: JSON.stringify([
          'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80'
        ]),
        ai_match_pct: 92,
        location_score: 9.2,
        lifestyle_score: 90,
        description: 'Eco-conscious gated enclave villa surrounded by 10 acres of greenery, organic fruit orchards, and world-class sports amenities.',
        amenities: JSON.stringify(['Jogging Track', 'Tennis Court', 'Children Play Area', '24x7 Power Backup', 'Rainwater Harvesting']),
        furnishing: 'Semi-Furnished',
        is_verified: 1,
        is_featured: 0
      },
      {
        title: 'The Grand Villa',
        listing_type: 'buy',
        property_type: 'Villa',
        price: 18000000,
        price_display: '₹1.8 Cr',
        city: 'Pune',
        state: 'Maharashtra',
        address: 'Koregaon Park Annexe, Pune',
        beds: 4,
        baths: 4,
        area_sqft: 2800,
        image_url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
        additional_images: JSON.stringify([
          'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80'
        ]),
        ai_match_pct: 90,
        location_score: 9.0,
        lifestyle_score: 93,
        description: 'Sprawling Mediterranean-inspired luxury villa with private plunge pool, pergola terrace, and lush manicured gardens.',
        amenities: JSON.stringify(['Private Plunge Pool', 'Pergola Terrace', 'Solar Water Heating', 'CCTV Surveillance', 'Covered Garage']),
        furnishing: 'Fully Furnished',
        is_verified: 1,
        is_featured: 0
      },
      {
        title: 'Lake View Residency',
        listing_type: 'buy',
        property_type: 'Apartment',
        price: 17500000,
        price_display: '₹1.75 Cr',
        city: 'Hyderabad',
        state: 'Telangana',
        address: 'Financial District, Gachibowli, Hyderabad',
        beds: 3,
        baths: 3,
        area_sqft: 2100,
        image_url: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=80',
        additional_images: JSON.stringify([
          'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=80'
        ]),
        ai_match_pct: 88,
        location_score: 8.8,
        lifestyle_score: 91,
        description: 'Ultra-modern lakefront residence close to major IT hubs, top international schools, and premium wellness facilities.',
        amenities: JSON.stringify(['Lake Facing Balcony', 'Olympic Sized Pool', 'Squash Court', 'Concierge Service', 'Fiber Broadband']),
        furnishing: 'Semi-Furnished',
        is_verified: 1,
        is_featured: 0
      },
      {
        title: 'Palm Meadows Ultra Villa',
        listing_type: 'buy',
        property_type: 'Villa',
        price: 31000000,
        price_display: '₹3.1 Cr',
        city: 'Gurgaon',
        state: 'Haryana',
        address: 'Golf Course Extension Road, Gurgaon',
        beds: 5,
        baths: 5,
        area_sqft: 4500,
        image_url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
        additional_images: JSON.stringify([
          'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80'
        ]),
        ai_match_pct: 95,
        location_score: 9.4,
        lifestyle_score: 96,
        description: 'Architectural masterpiece adjoining world-class golf course. Private glass elevator, temperature-controlled cellar, and private infinity deck.',
        amenities: JSON.stringify(['Golf View', 'Private Glass Lift', 'Smart Climate Control', 'Servant Quarters', 'Steam & Sauna Room']),
        furnishing: 'Fully Furnished',
        is_verified: 1,
        is_featured: 1
      },
      {
        title: 'Prestige Sunrise Haven',
        listing_type: 'rent',
        property_type: 'Apartment',
        price: 45000,
        price_display: '₹45,000 / month',
        city: 'Bangalore',
        state: 'Karnataka',
        address: 'Whitefield Main Boulevard, Bangalore',
        beds: 3,
        baths: 2,
        area_sqft: 1600,
        image_url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
        additional_images: JSON.stringify([
          'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80'
        ]),
        ai_match_pct: 93,
        location_score: 9.3,
        lifestyle_score: 91,
        description: 'Sun-drenched, designer rental apartment with open kitchen, premium woodwork, fast metro proximity, and comprehensive society amenities.',
        amenities: JSON.stringify(['Fully Modular Kitchen', 'Covered Parking', 'Gymnasium', 'Kids Play Zone', 'Piped Gas Line']),
        furnishing: 'Semi-Furnished',
        is_verified: 1,
        is_featured: 1
      },
      {
        title: 'Lodha Splendora Penthouse',
        listing_type: 'rent',
        property_type: 'Penthouse',
        price: 65000,
        price_display: '₹65,000 / month',
        city: 'Mumbai',
        state: 'Maharashtra',
        address: 'Ghodbunder Road, Thane, Mumbai',
        beds: 3,
        baths: 3,
        area_sqft: 1950,
        image_url: 'https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=1200&q=80',
        additional_images: JSON.stringify([
          'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80'
        ]),
        ai_match_pct: 91,
        location_score: 8.9,
        lifestyle_score: 92,
        description: 'Lavish penthouse with private terrace garden, stunning yeoor hill views, and bespoke furnishings ready for immediate move-in.',
        amenities: JSON.stringify(['Private Terrace', 'Hill View', 'Fully Furnished', 'Infinity Pool Access', 'Jacuzzi']),
        furnishing: 'Fully Furnished',
        is_verified: 1,
        is_featured: 0
      },
      {
        title: 'Cyber Studio Suite',
        listing_type: 'rent',
        property_type: 'Studio',
        price: 28000,
        price_display: '₹28,000 / month',
        city: 'Hyderabad',
        state: 'Telangana',
        address: 'Mindspace IT Park, Madhapur, Hyderabad',
        beds: 1,
        baths: 1,
        area_sqft: 750,
        image_url: 'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?auto=format&fit=crop&w=1200&q=80',
        additional_images: JSON.stringify([
          'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80'
        ]),
        ai_match_pct: 89,
        location_score: 9.5,
        lifestyle_score: 88,
        description: 'Chic, compact smart studio tailored for IT professionals. Walkable to major tech parks, fully serviced with high-speed WiFi and housekeeping.',
        amenities: JSON.stringify(['High Speed WiFi', 'Workstation Desk', 'Smart TV', 'Biometric Entry', 'Laundry Service']),
        furnishing: 'Fully Furnished',
        is_verified: 1,
        is_featured: 0
      },
      {
        title: 'Apex Horizon Tech Park Office',
        listing_type: 'commercial',
        property_type: 'Commercial Space',
        price: 125000000,
        price_display: '₹12.5 Cr',
        city: 'Bangalore',
        state: 'Karnataka',
        address: 'Bellandur Outer Ring Road, Bangalore',
        beds: 0,
        baths: 6,
        area_sqft: 9500,
        image_url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
        additional_images: JSON.stringify([
          'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1200&q=80'
        ]),
        ai_match_pct: 95,
        location_score: 9.7,
        lifestyle_score: 94,
        description: 'Grade-A tech park corporate office floor. Capacity for 140 workstations, 4 executive conference suites, server room, and cafeteria.',
        amenities: JSON.stringify(['140 Workstations', 'Grade-A LEED Certified', '100% DG Power Backup', 'Dedicated Fiber Duct', 'Basement Parking for 20 Cars']),
        furnishing: 'Fully Furnished',
        is_verified: 1,
        is_featured: 1
      },
      {
        title: 'BKC Executive Tower Office',
        listing_type: 'commercial',
        property_type: 'Commercial Space',
        price: 250000000,
        price_display: '₹25.0 Cr',
        city: 'Mumbai',
        state: 'Maharashtra',
        address: 'Bandra Kurla Complex (BKC), G-Block, Mumbai',
        beds: 0,
        baths: 8,
        area_sqft: 15000,
        image_url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80',
        additional_images: JSON.stringify([
          'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80'
        ]),
        ai_match_pct: 98,
        location_score: 9.9,
        lifestyle_score: 96,
        description: 'Prime commercial headquarters in Indias financial epicenter. World-class glass facade, LEED Platinum certified, double height reception lobby.',
        amenities: JSON.stringify(['LEED Platinum', 'Private Executive Boardrooms', 'High Speed Destination Elevators', 'Multi-level Car Parking']),
        furnishing: 'Fully Furnished',
        is_verified: 1,
        is_featured: 1
      }
    ];

    for (const prop of defaultProperties) {
      await dbRun(
        `INSERT INTO properties (
          title, listing_type, property_type, price, price_display, city, state, address,
          beds, baths, area_sqft, image_url, additional_images, ai_match_pct, location_score,
          lifestyle_score, description, amenities, furnishing, is_verified, is_featured
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          prop.title, prop.listing_type, prop.property_type, prop.price, prop.price_display,
          prop.city, prop.state, prop.address, prop.beds, prop.baths, prop.area_sqft,
          prop.image_url, prop.additional_images, prop.ai_match_pct, prop.location_score,
          prop.lifestyle_score, prop.description, prop.amenities, prop.furnishing,
          prop.is_verified, prop.is_featured
        ]
      );
    }
    console.log('Seeded properties matching XenProperty showcase.');
  }
}

module.exports = {
  db,
  dbRun,
  dbAll,
  dbGet,
  initDatabase
};
