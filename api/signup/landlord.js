// server.js - Main Express server setup
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many signup attempts, please try again later'
});

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nyumbasyncmongodb+srv://nyachekisuppliers:KWTm8HHLgftzdnE7@nyumbasync.ytts2nv.mongodb.net/?retryWrites=true&w=majority&appName=nyumbasync', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Database Models
const { Schema } = mongoose;

// User base schema
const userBaseSchema = {
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  idNumber: { type: String, required: true, unique: true },
  userType: { type: String, enum: ['tenant', 'landlord', 'agent'], required: true },
  isVerified: { type: Boolean, default: false },
  verificationToken: String,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
};

// Tenant Schema
const tenantSchema = new Schema({
  ...userBaseSchema,
  middleName: { type: String, trim: true },
  agentLandlordCode: { type: String, required: true },
  houseNumber: { type: String, required: true },
  landlordDetails: {
    name: String,
    contact: String,
    propertyName: String,
    location: String
  },
  leaseDetails: {
    startDate: Date,
    endDate: Date,
    monthlyRent: Number,
    deposit: Number,
    status: { type: String, enum: ['active', 'expired', 'terminated'], default: 'active' }
  }
});

// Landlord Schema
const landlordSchema = new Schema({
  ...userBaseSchema,
  businessRegistrationNumber: { type: String, trim: true },
  properties: [{
    propertyName: { type: String, required: true },
    propertyType: { type: String, enum: ['residential', 'commercial', 'mixed'], required: true },
    propertyAddress: { type: String, required: true },
    totalUnits: { type: Number, required: true, min: 1 },
    availableUnits: { type: Number, default: 0 },
    rent: { type: Number, default: 0 },
    features: [String],
    images: [String],
    createdAt: { type: Date, default: Date.now }
  }],
  totalProperties: { type: Number, default: 0 },
  totalUnits: { type: Number, default: 0 },
  agentCode: { type: String, unique: true } // Generated code for tenants to use
});

// Agent Schema
const agentSchema = new Schema({
  ...userBaseSchema,
  agencyName: { type: String, required: true },
  licenseNumber: { type: String, required: true, unique: true },
  agencyAddress: { type: String, required: true },
  yearsOfExperience: { type: Number, required: true, min: 0 },
  specialization: [{ type: String, enum: ['residential', 'commercial', 'industrial', 'land', 'property-management'] }],
  termsAgreement: { type: Boolean, required: true },
  isApproved: { type: Boolean, default: false },
  approvedAt: Date,
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  agentCode: { type: String, unique: true }, // Generated code for landlords to use
  managedProperties: [{ type: Schema.Types.ObjectId, ref: 'Property' }],
  clients: [{ type: Schema.Types.ObjectId, ref: 'User' }]
});

// Create models
const Tenant = mongoose.model('Tenant', tenantSchema);
const Landlord = mongoose.model('Landlord', landlordSchema);
const Agent = mongoose.model('Agent', agentSchema);

// Email configuration
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Utility functions
const generateUniqueCode = (prefix) => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substr(2, 5);
  return `${prefix}${timestamp}${randomStr}`.toUpperCase();
};

const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(12);
  return await bcrypt.hash(password, salt);
};

const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const sendVerificationEmail = async (email, token, firstName, userType) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}&type=${userType}`;
  
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Welcome to NyumbaSync - Verify Your Email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #667eea;">Welcome to NyumbaSync, ${firstName}!</h2>
        <p>Thank you for signing up as a ${userType}. Please verify your email address to complete your registration.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #667eea;">${verificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 14px;">
          If you didn't create this account, please ignore this email.
        </p>
      </div>
    `
  };
  
  await transporter.sendMail(mailOptions);
};

// Validation functions
const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

const validatePhone = (phone) => {
  const re = /^[\+]?[1-9][\d]{0,15}$/;
  return re.test(phone.replace(/\s/g, ''));
};

const validatePassword = (password) => {
  // At least 8 characters, one uppercase, one lowercase, one number
  const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
  return re.test(password);
};

// Mock function to validate agent/landlord codes (replace with actual logic)
const validateAgentLandlordCode = async (code) => {
  // This would typically check against your database
  // For now, returning mock data
  return {
    isValid: true,
    details: {
      name: 'John Doe',
      contact: '+254 123 456 789',
      propertyName: 'Sunset Apartments',
      location: 'Nairobi, Kenya'
    }
  };
};

// API Routes

// 1. TENANT SIGNUP
app.post('/api/signup/tenant', signupLimiter, async (req, res) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      email,
      idNumber,
      agentLandlordCode,
      houseNumber,
      landlordDetails
    } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !idNumber || !agentLandlordCode || !houseNumber) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Check if user already exists
    const existingTenant = await Tenant.findOne({
      $or: [
        { email: email.toLowerCase() },
        { idNumber: idNumber }
      ]
    });

    if (existingTenant) {
      return res.status(409).json({
        success: false,
        message: 'User with this email or ID number already exists'
      });
    }

    // Validate agent/landlord code
    const codeValidation = await validateAgentLandlordCode(agentLandlordCode);
    if (!codeValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid agent/landlord code'
      });
    }

    // Generate temporary password (to be changed on first login)
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const hashedPassword = await hashPassword(tempPassword);
    const verificationToken = generateVerificationToken();

    // Create tenant
    const tenant = new Tenant({
      firstName,
      middleName,
      lastName,
      email: email.toLowerCase(),
      password: hashedPassword,
      phoneNumber: landlordDetails.contact || '',
      idNumber,
      userType: 'tenant',
      agentLandlordCode,
      houseNumber,
      landlordDetails,
      verificationToken
    });

    await tenant.save();

    // Send verification email with temporary password
    await sendVerificationEmail(email, verificationToken, firstName, 'tenant');

    res.status(201).json({
      success: true,
      message: 'Tenant registration successful. Please check your email to verify your account.',
      data: {
        id: tenant._id,
        firstName: tenant.firstName,
        lastName: tenant.lastName,
        email: tenant.email,
        tempPassword: tempPassword // Send temp password in response (in production, send via separate secure channel)
      }
    });

  } catch (error) {
    console.error('Tenant signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// 2. LANDLORD SIGNUP
app.post('/api/signup/landlord', signupLimiter, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      idNumber,
      businessRegistrationNumber,
      password,
      confirmPassword,
      properties
    } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !phoneNumber || !idNumber || !password || !properties?.length) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    if (!validatePhone(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters with uppercase, lowercase, and number'
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    // Check if user already exists
    const existingLandlord = await Landlord.findOne({
      $or: [
        { email: email.toLowerCase() },
        { idNumber: idNumber }
      ]
    });

    if (existingLandlord) {
      return res.status(409).json({
        success: false,
        message: 'User with this email or ID number already exists'
      });
    }

    // Validate properties
    const validatedProperties = properties.map(prop => {
      if (!prop.propertyName || !prop.propertyType || !prop.propertyAddress || !prop.totalUnits) {
        throw new Error('All property fields are required');
      }
      return {
        ...prop,
        availableUnits: prop.totalUnits // Initially all units are available
      };
    });

    const hashedPassword = await hashPassword(password);
    const verificationToken = generateVerificationToken();
    const agentCode = generateUniqueCode('LL');

    // Calculate totals
    const totalProperties = validatedProperties.length;
    const totalUnits = validatedProperties.reduce((sum, prop) => sum + prop.totalUnits, 0);

    // Create landlord
    const landlord = new Landlord({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password: hashedPassword,
      phoneNumber,
      idNumber,
      businessRegistrationNumber,
      userType: 'landlord',
      properties: validatedProperties,
      totalProperties,
      totalUnits,
      agentCode,
      verificationToken
    });

    await landlord.save();

    // Send verification email
    await sendVerificationEmail(email, verificationToken, firstName, 'landlord');

    res.status(201).json({
      success: true,
      message: 'Landlord registration successful. Please check your email to verify your account.',
      data: {
        id: landlord._id,
        firstName: landlord.firstName,
        lastName: landlord.lastName,
        email: landlord.email,
        agentCode: landlord.agentCode,
        totalProperties: landlord.totalProperties,
        totalUnits: landlord.totalUnits
      }
    });

  } catch (error) {
    console.error('Landlord signup error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// 3. AGENT SIGNUP
app.post('/api/signup/agent', signupLimiter, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      idNumber,
      password,
      confirmPassword,
      agencyName,
      licenseNumber,
      agencyAddress,
      yearsOfExperience,
      specialization,
      termsAgreement
    } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !phoneNumber || !idNumber || !password || 
        !agencyName || !licenseNumber || !agencyAddress || yearsOfExperience === undefined || 
        !specialization?.length || !termsAgreement) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    if (!validatePhone(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters with uppercase, lowercase, and number'
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    // Check if user already exists
    const existingAgent = await Agent.findOne({
      $or: [
        { email: email.toLowerCase() },
        { idNumber: idNumber },
        { licenseNumber: licenseNumber }
      ]
    });

    if (existingAgent) {
      return res.status(409).json({
        success: false,
        message: 'User with this email, ID number, or license number already exists'
      });
    }

    const hashedPassword = await hashPassword(password);
    const verificationToken = generateVerificationToken();
    const agentCode = generateUniqueCode('AG');

    // Create agent
    const agent = new Agent({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password: hashedPassword,
      phoneNumber,
      idNumber,
      userType: 'agent',
      agencyName,
      licenseNumber,
      agencyAddress,
      yearsOfExperience,
      specialization,
      termsAgreement,
      agentCode,
      verificationToken
    });

    await agent.save();

    // Send verification email
    await sendVerificationEmail(email, verificationToken, firstName, 'agent');

    res.status(201).json({
      success: true,
      message: 'Agent registration successful. Your account is pending approval. Please check your email to verify your account.',
      data: {
        id: agent._id,
        firstName: agent.firstName,
        lastName: agent.lastName,
        email: agent.email,
        agentCode: agent.agentCode,
        agencyName: agent.agencyName,
        isApproved: agent.isApproved
      }
    });

  } catch (error) {
    console.error('Agent signup error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// 4. EMAIL VERIFICATION
app.post('/api/verify-email', async (req, res) => {
  try {
    const { token, type } = req.body;

    if (!token || !type) {
      return res.status(400).json({
        success: false,
        message: 'Token and type are required'
      });
    }

    let user;
    switch (type) {
      case 'tenant':
        user = await Tenant.findOne({ verificationToken: token });
        break;
      case 'landlord':
        user = await Landlord.findOne({ verificationToken: token });
        break;
      case 'agent':
        user = await Agent.findOne({ verificationToken: token });
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid user type'
        });
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }

    // Update user verification status
    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Email verified successfully',
      data: {
        id: user._id,
        email: user.email,
        userType: user.userType,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// 5. CODE VALIDATION ENDPOINTS
app.post('/api/validate/agent-landlord-code', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Code is required'
      });
    }

    const validation = await validateAgentLandlordCode(code);
    
    res.json({
      success: validation.isValid,
      message: validation.isValid ? 'Code validated successfully' : 'Invalid code',
      data: validation.isValid ? validation.details : null
    });

  } catch (error) {
    console.error('Code validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

app.post('/api/validate/house-number', async (req, res) => {
  try {
    const { houseNumber, agentLandlordCode } = req.body;

    if (!houseNumber || !agentLandlordCode) {
      return res.status(400).json({
        success: false,
        message: 'House number and agent/landlord code are required'
      });
    }

    // Mock validation - replace with actual logic
    const isValid = houseNumber.trim().length > 0;
    
    res.json({
      success: isValid,
      message: isValid ? 'House number validated successfully' : 'Invalid house number'
    });

  } catch (error) {
    console.error('House number validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// 6. GET USER PROFILE
app.get('/api/user/profile/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query;

    let user;
    switch (type) {
      case 'tenant':
        user = await Tenant.findById(id).select('-password -verificationToken');
        break;
      case 'landlord':
        user = await Landlord.findById(id).select('-password -verificationToken');
        break;
      case 'agent':
        user = await Agent.findById(id).select('-password -verificationToken');
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid user type'
        });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;