/**
 * Property Matching Flow Definitions
 * Automated workflows for matching properties to buyers
 */

module.exports = [
  {
    id: 'new-property-match-alert',
    name: 'New Property Match Alert',
    description: 'Alert buyers when a new property matches their criteria',
    trigger: {
      event: 'property.created'
    },
    conditions: [
      {
        field: 'property.status',
        operator: 'equals',
        value: 'available'
      }
    ],
    actions: [
      {
        type: 'findMatchingBuyers',
        params: {
          propertyId: '{{propertyId}}',
          property: '{{property}}'
        }
      }
    ],
    enabled: true
  },

  {
    id: 'property-price-drop-alert',
    name: 'Property Price Drop Alert',
    description: 'Alert interested buyers when property price drops',
    trigger: {
      event: 'property.price.changed'
    },
    conditions: [
      {
        field: 'newPrice',
        operator: 'less_than',
        value: '{{oldPrice}}'
      }
    ],
    actions: [
      {
        type: 'notifyInterestedContacts',
        params: {
          propertyId: '{{propertyId}}',
          subject: 'Price Drop Alert: {{property.title}}',
          message: 'Great news! The price dropped from {{oldPrice}} to {{newPrice}}',
          oldPrice: '{{oldPrice}}',
          newPrice: '{{newPrice}}'
        }
      }
    ],
    enabled: true
  },

  {
    id: 'property-listed-notify-matches',
    name: 'Property Listed - Notify Matching Buyers',
    description: 'When property is listed, notify all matching buyers',
    trigger: {
      event: 'property.listed'
    },
    conditions: [],
    actions: [
      {
        type: 'findMatchingBuyers',
        params: {
          propertyId: '{{propertyId}}',
          property: '{{property}}',
          notificationType: 'instant'
        }
      }
    ],
    enabled: true
  },

  {
    id: 'property-back-on-market',
    name: 'Property Back on Market Alert',
    description: 'Alert previous interested buyers when property becomes available again',
    trigger: {
      event: 'property.status.changed'
    },
    conditions: [
      {
        field: 'newStatus',
        operator: 'equals',
        value: 'available'
      },
      {
        field: 'oldStatus',
        operator: 'equals',
        value: 'occupied'
      }
    ],
    actions: [
      {
        type: 'notifyPreviouslyInterestedContacts',
        params: {
          propertyId: '{{propertyId}}',
          subject: 'Property Available Again: {{property.title}}',
          message: 'The property you were interested in is now available!'
        }
      }
    ],
    enabled: true
  }
];
