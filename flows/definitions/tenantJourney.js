/**
 * Tenant Journey Flow Definitions
 * Automated workflows for the 7-stage tenant journey
 */

module.exports = {
  // Stage 1: Prospect - Application Welcome
  prospectWelcome: {
    name: 'prospect-welcome',
    description: 'Send welcome email when new rental prospect is created',
    enabled: true,
    
    trigger: {
      model: 'Contact',
      event: 'created',
      condition: (contact) => {
        return contact.tags?.includes('rental-prospect') ||
               contact.tenantJourney?.currentStage === 'prospect';
      }
    },
    
    actions: [
      {
        type: 'email',
        template: 'prospect-welcome',
        to: '{{contact.email}}',
        subject: 'Welcome! Your Rental Application',
        data: {
          firstName: '{{contact.firstName}}',
          applicationUrl: '{{env.TENANT_PORTAL_URL}}/apply'
        }
      },
      {
        type: 'task',
        title: 'Follow up with new prospect: {{contact.fullName}}',
        dueDate: { days: 2 },
        assignTo: '{{contact.assignedTo}}',
        priority: 'medium'
      },
      {
        type: 'data',
        action: 'update',
        model: 'Contact',
        id: '{{contact._id}}',
        data: {
          'interactions': {
            $push: {
              type: 'email',
              subject: 'Application welcome email sent',
              date: new Date(),
              notes: 'Automated welcome email with application link'
            }
          }
        }
      }
    ]
  },

  // Stage 2: Applicant - Background Check
  applicationSubmitted: {
    name: 'application-submitted',
    description: 'Process application submission and initiate background check',
    enabled: true,
    
    trigger: {
      model: 'Contact',
      event: 'updated',
      condition: (contact, oldContact) => {
        return contact.tenantJourney?.currentStage === 'applicant' &&
               oldContact.tenantJourney?.currentStage !== 'applicant';
      }
    },

    
    actions: [
      {
        type: 'email',
        template: 'application-received',
        to: '{{contact.email}}',
        subject: 'Application Received - Next Steps',
        data: {
          firstName: '{{contact.firstName}}',
          backgroundCheckUrl: '{{env.BACKGROUND_CHECK_URL}}'
        }
      },
      {
        type: 'task',
        title: 'Review application for {{contact.fullName}}',
        description: 'Review submitted application and screening reports',
        dueDate: { days: 1 },
        assignTo: '{{contact.assignedTo}}',
        priority: 'high',
        metadata: {
          contactId: '{{contact._id}}',
          taskType: 'application_review'
        }
      },
      {
        type: 'task',
        title: 'Verify income for {{contact.fullName}}',
        dueDate: { days: 2 },
        assignTo: '{{contact.assignedTo}}',
        priority: 'high'
      },
      {
        type: 'task',
        title: 'Check references for {{contact.fullName}}',
        dueDate: { days: 3 },
        assignTo: '{{contact.assignedTo}}',
        priority: 'medium'
      },
      {
        type: 'data',
        action: 'update',
        model: 'Property',
        condition: '{{contact.tenantJourney.prospectInfo.interestedProperties.0}}',
        id: '{{contact.tenantJourney.prospectInfo.interestedProperties.0}}',
        data: {
          status: 'pending_application'
        }
      }
    ]
  },

  // Stage 3: Approved - Lease Generation
  applicationApproved: {
    name: 'application-approved',
    description: 'Generate lease and send to approved applicant',
    enabled: true,
    
    trigger: {
      model: 'Contact',
      event: 'updated',
      condition: (contact, oldContact) => {
        return contact.tenantJourney?.currentStage === 'approved' &&
               oldContact.tenantJourney?.currentStage !== 'approved';
      }
    },
    
    actions: [
      {
        type: 'email',
        template: 'application-approved',
        to: '{{contact.email}}',
        subject: 'Congratulations! Your Application is Approved',
        data: {
          firstName: '{{contact.firstName}}',
          securityDeposit: '{{contact.tenantJourney.reviewInfo.securityDepositAmount}}',
          leaseUrl: '{{env.TENANT_PORTAL_URL}}/lease/sign'
        }
      },
      {
        type: 'task',
        title: 'Generate lease for {{contact.fullName}}',
        description: 'Create and send lease agreement for signature',
        dueDate: { hours: 24 },
        assignTo: '{{contact.assignedTo}}',
        priority: 'high'
      },
      {
        type: 'task',
        title: 'Monitor lease signing for {{contact.fullName}}',
        dueDate: { days: 7 },
        assignTo: '{{contact.assignedTo}}',
        priority: 'medium'
      }
    ]
  },

  // Stage 3: Rejected - Adverse Action
  applicationRejected: {
    name: 'application-rejected',
    description: 'Send adverse action notice for rejected application',
    enabled: true,
    
    trigger: {
      model: 'Contact',
      event: 'updated',
      condition: (contact, oldContact) => {
        return contact.tenantJourney?.currentStage === 'rejected' &&
               oldContact.tenantJourney?.currentStage !== 'rejected';
      }
    },
    
    actions: [
      {
        type: 'email',
        template: 'adverse-action',
        to: '{{contact.email}}',
        subject: 'Application Decision Notice',
        data: {
          firstName: '{{contact.firstName}}',
          reason: '{{contact.tenantJourney.reviewInfo.rejectionReason}}'
        }
      },
      {
        type: 'data',
        action: 'update',
        model: 'Contact',
        id: '{{contact._id}}',
        data: {
          'tenantJourney.reviewInfo.adverseActionSent': true,
          'tenantJourney.reviewInfo.adverseActionSentAt': new Date()
        }
      }
    ]
  },

  // Stage 4: Leased - Tenant Onboarding
  leaseActivated: {
    name: 'lease-activated',
    description: 'Onboard new tenant with welcome packet and setup',
    enabled: true,
    
    trigger: {
      model: 'Contact',
      event: 'updated',
      condition: (contact, oldContact) => {
        return contact.tenantJourney?.currentStage === 'leased' &&
               oldContact.tenantJourney?.currentStage !== 'leased';
      }
    },
    
    actions: [
      {
        type: 'email',
        template: 'move-in-welcome',
        to: '{{contact.email}}',
        subject: 'Welcome to Your New Home!',
        data: {
          firstName: '{{contact.firstName}}',
          moveInDate: '{{contact.tenantJourney.leaseInfo.moveInDate}}',
          portalUrl: '{{env.TENANT_PORTAL_URL}}'
        }
      },
      {
        type: 'data',
        action: 'create',
        model: 'Transaction',
        data: {
          dealType: 'lease',
          contacts: [{
            contact: '{{contact._id}}',
            role: 'tenant',
            isPrimary: true
          }],
          property: '{{contact.tenantJourney.prospectInfo.interestedProperties.0}}',
          amount: '{{contact.tenantJourney.leaseInfo.monthlyRent}}',
          'pipeline.stage': 'closed',
          'financials.salePrice': '{{contact.tenantJourney.leaseInfo.monthlyRent}}',
          metadata: {
            leaseStartDate: '{{contact.tenantJourney.leaseInfo.leaseStartDate}}',
            leaseEndDate: '{{contact.tenantJourney.leaseInfo.leaseEndDate}}'
          }
        }
      },
      {
        type: 'task',
        title: 'Schedule move-in inspection for {{contact.fullName}}',
        dueDate: { days: 1 },
        assignTo: '{{contact.assignedTo}}',
        priority: 'high'
      },
      {
        type: 'task',
        title: 'Verify rent payment received for {{contact.fullName}}',
        recurring: {
          frequency: 'monthly',
          dayOfMonth: '{{contact.tenantJourney.leaseInfo.rentDueDay}}'
        },
        assignTo: '{{contact.assignedTo}}',
        priority: 'high'
      }
    ]
  },

  // Stage 4: Rent Reminder
  rentReminder: {
    name: 'rent-reminder',
    description: 'Send rent payment reminder before due date',
    enabled: true,
    
    trigger: {
      type: 'scheduled',
      schedule: 'daily',
      condition: (contact) => {
        if (contact.tenantJourney?.currentStage !== 'leased') return false;
        
        const today = new Date();
        const rentDueDay = contact.tenantJourney.leaseInfo?.rentDueDay || 1;
        const daysUntilDue = rentDueDay - today.getDate();
        
        // Send reminder 5 days before due date
        return daysUntilDue === 5;
      }
    },
    
    actions: [
      {
        type: 'email',
        template: 'rent-reminder',
        to: '{{contact.email}}',
        subject: 'Rent Payment Reminder',
        data: {
          firstName: '{{contact.firstName}}',
          amount: '{{contact.tenantJourney.leaseInfo.monthlyRent}}',
          dueDate: '{{contact.tenantJourney.leaseInfo.rentDueDay}}',
          paymentUrl: '{{env.TENANT_PORTAL_URL}}/pay-rent'
        }
      },
      {
        type: 'sms',
        to: '{{contact.phone}}',
        message: 'Hi {{contact.firstName}}, your rent of KES {{contact.tenantJourney.leaseInfo.monthlyRent}} is due on the {{contact.tenantJourney.leaseInfo.rentDueDay}}. Pay online at {{env.TENANT_PORTAL_URL}}/pay-rent'
      }
    ]
  },

  // Stage 5: Maintenance Request Auto-Reply
  maintenanceRequestReceived: {
    name: 'maintenance-request-received',
    description: 'Auto-reply when maintenance request is submitted',
    enabled: true,
    
    trigger: {
      model: 'MaintenanceRequest',
      event: 'created'
    },
    
    actions: [
      {
        type: 'email',
        template: 'maintenance-request-received',
        to: '{{maintenanceRequest.tenant.email}}',
        subject: 'Maintenance Request #{{maintenanceRequest.requestNumber}} Received',
        data: {
          firstName: '{{maintenanceRequest.tenant.firstName}}',
          requestNumber: '{{maintenanceRequest.requestNumber}}',
          category: '{{maintenanceRequest.category}}',
          priority: '{{maintenanceRequest.priority}}'
        }
      },
      {
        type: 'task',
        title: 'Review maintenance request #{{maintenanceRequest.requestNumber}}',
        description: '{{maintenanceRequest.title}} - {{maintenanceRequest.location}}',
        dueDate: { 
          hours: '{{maintenanceRequest.priority === "emergency" ? 2 : 24}}'
        },
        assignTo: '{{maintenanceRequest.property.assignedTo}}',
        priority: '{{maintenanceRequest.priority}}',
        metadata: {
          requestId: '{{maintenanceRequest._id}}',
          taskType: 'maintenance_review'
        }
      },
      {
        type: 'data',
        action: 'update',
        model: 'Contact',
        id: '{{maintenanceRequest.tenant._id}}',
        method: 'recordMaintenanceRequest'
      }
    ]
  },

  // Stage 5: Maintenance Request Assigned to Vendor
  maintenanceRequestAssigned: {
    name: 'maintenance-request-assigned',
    description: 'Notify vendor when maintenance request is assigned',
    enabled: true,
    
    trigger: {
      model: 'MaintenanceRequest',
      event: 'updated',
      condition: (request, oldRequest) => {
        return request.assignedTo && !oldRequest.assignedTo;
      }
    },
    
    actions: [
      {
        type: 'email',
        template: 'maintenance-vendor-assigned',
        to: '{{maintenanceRequest.assignedTo.email}}',
        subject: 'New Maintenance Request Assigned #{{maintenanceRequest.requestNumber}}',
        data: {
          vendorName: '{{maintenanceRequest.assignedTo.firstName}}',
          requestNumber: '{{maintenanceRequest.requestNumber}}',
          property: '{{maintenanceRequest.property.title}}',
          category: '{{maintenanceRequest.category}}',
          priority: '{{maintenanceRequest.priority}}',
          description: '{{maintenanceRequest.description}}'
        }
      },
      {
        type: 'email',
        template: 'maintenance-tenant-update',
        to: '{{maintenanceRequest.tenant.email}}',
        subject: 'Update on Request #{{maintenanceRequest.requestNumber}}',
        data: {
          firstName: '{{maintenanceRequest.tenant.firstName}}',
          requestNumber: '{{maintenanceRequest.requestNumber}}',
          status: 'A vendor has been assigned to your request'
        }
      }
    ]
  },

  // Stage 6: Move-Out Notice
  moveOutNoticeReceived: {
    name: 'move-out-notice-received',
    description: 'Process move-out notice and schedule inspection',
    enabled: true,
    
    trigger: {
      model: 'Contact',
      event: 'updated',
      condition: (contact, oldContact) => {
        return contact.tenantJourney?.currentStage === 'move_out_notice' &&
               oldContact.tenantJourney?.currentStage !== 'move_out_notice';
      }
    },
    
    actions: [
      {
        type: 'email',
        template: 'move-out-confirmation',
        to: '{{contact.email}}',
        subject: 'Move-Out Notice Received',
        data: {
          firstName: '{{contact.firstName}}',
          moveOutDate: '{{contact.tenantJourney.moveOutInfo.intendedMoveOutDate}}',
          proceduresUrl: '{{env.TENANT_PORTAL_URL}}/move-out-guide'
        }
      },
      {
        type: 'task',
        title: 'Schedule move-out inspection for {{contact.fullName}}',
        dueDate: { days: 3 },
        assignTo: '{{contact.assignedTo}}',
        priority: 'high'
      },
      {
        type: 'task',
        title: 'Process security deposit for {{contact.fullName}}',
        dueDate: { days: 30 },
        assignTo: '{{contact.assignedTo}}',
        priority: 'high'
      },
      {
        type: 'task',
        title: 'List property for rent',
        dueDate: { days: 7 },
        assignTo: '{{contact.assignedTo}}',
        priority: 'medium'
      }
    ]
  },

  // Stage 7: Tenancy Closed
  tenancyClosed: {
    name: 'tenancy-closed',
    description: 'Finalize tenancy and update property status',
    enabled: true,
    
    trigger: {
      model: 'Contact',
      event: 'updated',
      condition: (contact, oldContact) => {
        return contact.tenantJourney?.currentStage === 'former_tenant' &&
               oldContact.tenantJourney?.currentStage !== 'former_tenant';
      }
    },
    
    actions: [
      {
        type: 'email',
        template: 'tenancy-closed',
        to: '{{contact.email}}',
        subject: 'Thank You - Tenancy Closed',
        data: {
          firstName: '{{contact.firstName}}',
          securityDepositRefund: '{{contact.tenantJourney.moveOutInfo.securityDepositRefund.refundAmount}}'
        }
      },
      {
        type: 'data',
        action: 'update',
        model: 'Property',
        condition: '{{contact.tenantJourney.prospectInfo.interestedProperties.0}}',
        id: '{{contact.tenantJourney.prospectInfo.interestedProperties.0}}',
        data: {
          status: 'vacant'
        }
      },
      {
        type: 'data',
        action: 'update',
        model: 'Transaction',
        condition: '{{contact.tenantPortal.linkedLeases.0.transaction}}',
        id: '{{contact.tenantPortal.linkedLeases.0.transaction}}',
        data: {
          'pipeline.stage': 'closed',
          'pipeline.actualCloseDate': new Date()
        }
      }
    ]
  }
};
