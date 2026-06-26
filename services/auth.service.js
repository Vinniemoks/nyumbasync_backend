const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config/config');
const logger = require('../utils/logger');
const User = require('../models/user.model');

class AuthService {
  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} - Registered user data with token
   */
  static async register(userData) {
    try {
      // Check if user already exists
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        throw new Error('Email already in use');
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(userData.password, salt);

      // Create new user
      const user = new User({
        ...userData,
        password: hashedPassword,
        verificationToken: jwt.sign({ email: userData.email }, config.jwt.secret, { expiresIn: '1d' })
      });

      await user.save();

      // Generate auth token
      const token = this.generateToken(user);

      return {
        user: this.sanitizeUser(user),
        token
      };
    } catch (error) {
      logger.error(`AuthService.register error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Login user
   * @param {String} email - User email
   * @param {String} password - User password
   * @returns {Promise<Object>} - User data with token
   */
  static async login(email, password) {
    try {
      const user = await User.findOne({ email });
      if (!user) {
        throw new Error('Invalid credentials');
      }

      // Verify password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        throw new Error('Invalid credentials');
      }

      // Check if user is verified
      if (!user.isVerified) {
        throw new Error('Account not verified. Please check your email.');
      }

      // Generate auth token
      const token = this.generateToken(user);

      return {
        user: this.sanitizeUser(user),
        token
      };
    } catch (error) {
      logger.error(`AuthService.login error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify user account
   * @param {String} token - Verification token
   * @returns {Promise<Object>} - Verified user data
   */
  static async verifyAccount(token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await User.findOneAndUpdate(
        { email: decoded.email, verificationToken: token },
        { isVerified: true, verificationToken: null },
        { new: true }
      );

      if (!user) {
        throw new Error('Invalid or expired verification token');
      }

      return this.sanitizeUser(user);
    } catch (error) {
      logger.error(`AuthService.verifyAccount error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate JWT token
   * @param {Object} user - User object
   * @returns {String} - JWT token
   */
  static generateToken(user) {
    return jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
  }

  /**
   * Verify JWT token
   * @param {String} token - JWT token
   * @returns {Promise<Object>} - Decoded token payload
   */
  static async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      
      // Check if user still exists
      const user = await User.findById(decoded.id);
      if (!user) {
        throw new Error('User not found');
      }

      return decoded;
    } catch (error) {
      logger.error(`AuthService.verifyToken error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove sensitive data from user object
   * @param {Object} user - User object
   * @returns {Object} - Sanitized user object
   */
  static sanitizeUser(user) {
    const userObj = user.toObject ? user.toObject() : user;
    delete userObj.password;
    delete userObj.verificationToken;
    delete userObj.resetPasswordToken;
    return userObj;
  }

  /**
   * Request password reset
   * @param {String} email - User email
   * @returns {Promise<Object>} - Password reset token
   */
  static async requestPasswordReset(email) {
    try {
      const user = await User.findOne({ email });
      if (!user) {
        throw new Error('User not found');
      }

      const resetToken = jwt.sign(
        { id: user._id },
        config.jwt.secret,
        { expiresIn: '1h' }
      );

      user.resetPasswordToken = resetToken;
      await user.save();

      return { resetToken };
    } catch (error) {
      logger.error(`AuthService.requestPasswordReset error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reset user password
   * @param {String} token - Reset token
   * @param {String} newPassword - New password
   * @returns {Promise<Object>} - Updated user data
   */
  static async resetPassword(token, newPassword) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await User.findOne({
        _id: decoded.id,
        resetPasswordToken: token
      });

      if (!user) {
        throw new Error('Invalid or expired reset token');
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
      user.resetPasswordToken = null;
      await user.save();

      return this.sanitizeUser(user);
    } catch (error) {
      logger.error(`AuthService.resetPassword error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = AuthService;