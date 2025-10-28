const PropertyApproval = require('../models/property-approval.model');
const Property = require('../models/property.model');
const { logAdminActivity } = require('../utils/logger');
const { sendEmail } = require('../services/email.service');

const propertyApprovalController = {
  // Submit property for approval
  async submitForApproval(req, res) {
    try {
      const { propertyId, documents } = req.body;

      // Check if property exists
      const property = await Property.findById(propertyId);
      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      // Check if property already has an approval request
      const existingApproval = await PropertyApproval.findOne({ property: propertyId });
      if (existingApproval && existingApproval.status === 'pending') {
        return res.status(400).json({ error: 'Property already has a pending approval request' });
      }

      // Create new approval request
      const approval = await PropertyApproval.create({
        property: propertyId,
        documents: documents.map(doc => ({
          type: doc.type,
          url: doc.url
        }))
      });

      // Log activity
      await logAdminActivity(req.user._id, 'PROPERTY_APPROVAL_REQUESTED', {
        propertyId,
        approvalId: approval._id
      });

      res.status(201).json({
        message: 'Property submitted for approval',
        approval
      });
    } catch (error) {
      console.error('Property Approval Submission Error:', error);
      res.status(500).json({ error: 'Failed to submit property for approval' });
    }
  },

  // Review and update property approval
  async reviewApproval(req, res) {
    try {
      const { approvalId } = req.params;
      const { status, notes, complianceChecks, documents } = req.body;

      const approval = await PropertyApproval.findById(approvalId)
        .populate('property');

      if (!approval) {
        return res.status(404).json({ error: 'Approval request not found' });
      }

      // Update approval status
      approval.status = status;
      approval.notes = notes;
      approval.lastUpdatedBy = req.user._id;

      if (status === 'approved') {
        approval.approvedBy = req.user._id;
        approval.approvedAt = new Date();
        approval.nextReviewDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 6 months
      } else if (status === 'rejected') {
        approval.rejectionReason = notes;
      }

      // Update compliance checks
      if (complianceChecks) {
        approval.complianceChecks = complianceChecks.map(check => ({
          ...check,
          verifiedBy: req.user._id,
          verifiedAt: new Date()
        }));
      }

      // Update document verification
      if (documents) {
        documents.forEach(doc => {
          const existingDoc = approval.documents.find(d => d._id.toString() === doc._id);
          if (existingDoc) {
            existingDoc.verified = doc.verified;
            existingDoc.verifiedBy = req.user._id;
            existingDoc.verifiedAt = new Date();
            existingDoc.status = doc.status;
            existingDoc.expiryDate = doc.expiryDate;
          }
        });
      }

      // Calculate compliance score
      const totalChecks = approval.complianceChecks.length;
      const passedChecks = approval.complianceChecks.filter(check => check.status === 'passed').length;
      approval.complianceScore = Math.round((passedChecks / totalChecks) * 100);
      approval.isCompliant = approval.complianceScore >= 70;

      await approval.save();

      // Send notification email
      await sendEmail(approval.property.owner.email, {
        subject: `Property Approval Status Update - ${approval.status.toUpperCase()}`,
        template: 'propertyApprovalUpdate',
        data: {
          propertyName: approval.property.name,
          status: approval.status,
          notes: notes,
          complianceScore: approval.complianceScore
        }
      });

      // Log activity
      await logAdminActivity(req.user._id, 'PROPERTY_APPROVAL_REVIEWED', {
        propertyId: approval.property._id,
        approvalId: approval._id,
        status,
        complianceScore: approval.complianceScore
      });

      res.json({
        message: 'Approval review updated successfully',
        approval
      });
    } catch (error) {
      console.error('Property Approval Review Error:', error);
      res.status(500).json({ error: 'Failed to update approval review' });
    }
  },

  // Schedule property inspection
  async scheduleInspection(req, res) {
    try {
      const { approvalId } = req.params;
      const { type, date, inspector } = req.body;

      const approval = await PropertyApproval.findById(approvalId)
        .populate('property');

      if (!approval) {
        return res.status(404).json({ error: 'Approval request not found' });
      }

      approval.inspections.push({
        type,
        date: new Date(date),
        inspector,
        status: 'scheduled'
      });

      await approval.save();

      // Send notification email to inspector
      await sendEmail(inspector.email, {
        subject: 'New Property Inspection Scheduled',
        template: 'inspectionScheduled',
        data: {
          propertyName: approval.property.name,
          inspectionDate: date,
          inspectionType: type
        }
      });

      // Log activity
      await logAdminActivity(req.user._id, 'PROPERTY_INSPECTION_SCHEDULED', {
        propertyId: approval.property._id,
        approvalId: approval._id,
        inspectionDate: date,
        inspectorId: inspector
      });

      res.json({
        message: 'Inspection scheduled successfully',
        inspection: approval.inspections[approval.inspections.length - 1]
      });
    } catch (error) {
      console.error('Inspection Scheduling Error:', error);
      res.status(500).json({ error: 'Failed to schedule inspection' });
    }
  },

  // Complete inspection
  async completeInspection(req, res) {
    try {
      const { approvalId, inspectionId } = req.params;
      const { findings, rating, images, status } = req.body;

      const approval = await PropertyApproval.findById(approvalId);
      if (!approval) {
        return res.status(404).json({ error: 'Approval request not found' });
      }

      const inspection = approval.inspections.id(inspectionId);
      if (!inspection) {
        return res.status(404).json({ error: 'Inspection not found' });
      }

      // Update inspection details
      inspection.findings = findings;
      inspection.rating = rating;
      inspection.images = images;
      inspection.status = status;
      inspection.nextInspectionDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 3 months

      await approval.save();

      // Log activity
      await logAdminActivity(req.user._id, 'PROPERTY_INSPECTION_COMPLETED', {
        propertyId: approval.property,
        approvalId: approval._id,
        inspectionId: inspectionId,
        status
      });

      res.json({
        message: 'Inspection completed successfully',
        inspection
      });
    } catch (error) {
      console.error('Inspection Completion Error:', error);
      res.status(500).json({ error: 'Failed to complete inspection' });
    }
  },

  // Get property approval status
  async getApprovalStatus(req, res) {
    try {
      const { propertyId } = req.params;

      const approval = await PropertyApproval.findOne({ property: propertyId })
        .populate('property')
        .populate('approvedBy', 'email role')
        .populate('lastUpdatedBy', 'email role');

      if (!approval) {
        return res.status(404).json({ error: 'No approval request found for this property' });
      }

      res.json({ approval });
    } catch (error) {
      console.error('Approval Status Retrieval Error:', error);
      res.status(500).json({ error: 'Failed to get approval status' });
    }
  },

  // List properties pending approval
  async listPendingApprovals(req, res) {
    try {
      const { status, complianceScore } = req.query;

      // Build query
      const query = {};
      if (status) query.status = status;
      if (complianceScore) {
        query.complianceScore = { $gte: parseInt(complianceScore) };
      }

      const approvals = await PropertyApproval.find(query)
        .populate('property')
        .populate('approvedBy', 'email role')
        .populate('lastUpdatedBy', 'email role')
        .sort({ createdAt: -1 });

      res.json({ approvals });
    } catch (error) {
      console.error('Pending Approvals List Error:', error);
      res.status(500).json({ error: 'Failed to list pending approvals' });
    }
  }
};

module.exports = propertyApprovalController;