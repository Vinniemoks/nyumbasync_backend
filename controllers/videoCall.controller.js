const twilio = require('twilio');
const AccessToken = twilio.jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

// Controller for video calling functionality
class VideoCallController {
    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID;
        this.apiKeySid = process.env.TWILIO_API_KEY_SID;
        this.apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    }

    /**
     * Generate Twilio access token for video calling
     */
    async generateToken(req, res) {
        try {
            const { roomName, identity } = req.body;
            const userId = req.user.id;

            if (!roomName || !identity) {
                return res.status(400).json({
                    error: 'Room name and identity are required'
                });
            }

            // Create access token
            const token = new AccessToken(
                this.accountSid,
                this.apiKeySid,
                this.apiKeySecret,
                { identity: identity || userId }
            );

            // Create video grant
            const videoGrant = new VideoGrant({
                room: roomName
            });

            // Add grant to token
            token.addGrant(videoGrant);

            // Set token expiration (1 hour)
            token.ttl = 3600;

            res.json({
                token: token.toJwt(),
                roomName,
                identity: identity || userId
            });
        } catch (error) {
            console.error('Error generating video token:', error);
            res.status(500).json({
                error: 'Failed to generate video token',
                details: error.message
            });
        }
    }

    /**
     * Create a new video room
     */
    async createRoom(req, res) {
        try {
            const { roomName, participants } = req.body;
            const userId = req.user.id;

            if (!roomName) {
                return res.status(400).json({
                    error: 'Room name is required'
                });
            }

            const client = twilio(this.accountSid, process.env.TWILIO_AUTH_TOKEN);

            // Create room with options
            const room = await client.video.rooms.create({
                uniqueName: roomName,
                type: 'group', // 'peer-to-peer' for 2 participants, 'group' for more
                recordParticipantsOnConnect: false,
                statusCallback: `${process.env.API_BASE_URL}/api/v1/video/webhook`
            });

            // Store room info in database (optional)
            // await VideoCallModel.create({ roomName, createdBy: userId, participants });

            res.status(201).json({
                success: true,
                room: {
                    sid: room.sid,
                    name: room.uniqueName,
                    status: room.status,
                    type: room.type,
                    createdAt: room.dateCreated
                }
            });
        } catch (error) {
            console.error('Error creating room:', error);
            res.status(500).json({
                error: 'Failed to create video room',
                details: error.message
            });
        }
    }

    /**
     * Get list of active rooms
     */
    async getActiveRooms(req, res) {
        try {
            const client = twilio(this.accountSid, process.env.TWILIO_AUTH_TOKEN);

            const rooms = await client.video.rooms.list({
                status: 'in-progress',
                limit: 20
            });

            res.json({
                rooms: rooms.map(room => ({
                    sid: room.sid,
                    name: room.uniqueName,
                    status: room.status,
                    type: room.type,
                    duration: room.duration,
                    participants: room.participants || []
                }))
            });
        } catch (error) {
            console.error('Error fetching rooms:', error);
            res.status(500).json({
                error: 'Failed to fetch active rooms',
                details: error.message
            });
        }
    }

    /**
     * End a video call/room
     */
    async endRoom(req, res) {
        try {
            const { roomSid } = req.params;

            if (!roomSid) {
                return res.status(400).json({
                    error: 'Room SID is required'
                });
            }

            const client = twilio(this.accountSid, process.env.TWILIO_AUTH_TOKEN);

            // Complete the room
            const room = await client.video.rooms(roomSid).update({
                status: 'completed'
            });

            res.json({
                success: true,
                message: 'Video call ended successfully',
                room: {
                    sid: room.sid,
                    status: room.status,
                    endTime: room.endTime
                }
            });
        } catch (error) {
            console.error('Error ending room:', error);
            res.status(500).json({
                error: 'Failed to end video call',
                details: error.message
            });
        }
    }

    /**
     * Get call history (requires database model)
     */
    async getCallHistory(req, res) {
        try {
            const userId = req.user.id;
            const client = twilio(this.accountSid, process.env.TWILIO_AUTH_TOKEN);

            // Get completed rooms from Twilio
            const rooms = await client.video.rooms.list({
                status: 'completed',
                limit: 50
            });

            res.json({
                history: rooms.map(room => ({
                    sid: room.sid,
                    name: room.uniqueName,
                    duration: room.duration,
                    startTime: room.dateCreated,
                    endTime: room.endTime
                }))
            });
        } catch (error) {
            console.error('Error fetching call history:', error);
            res.status(500).json({
                error: 'Failed to fetch call history',
                details: error.message
            });
        }
    }

    /**
     * Webhook handler for Twilio status callbacks
     */
    async handleWebhook(req, res) {
        try {
            const { RoomSid, RoomName, RoomStatus, ParticipantIdentity, StatusCallbackEvent } = req.body;

            console.log('Twilio webhook:', {
                event: StatusCallbackEvent,
                room: RoomName,
                status: RoomStatus
            });

            // Handle different events
            switch (StatusCallbackEvent) {
                case 'room-created':
                    // Handle room creation
                    break;
                case 'room-ended':
                    // Handle room end, update database
                    break;
                case 'participant-connected':
                    // Handle participant join
                    break;
                case 'participant-disconnected':
                    // Handle participant leave
                    break;
            }

            res.status(200).send('OK');
        } catch (error) {
            console.error('Webhook error:', error);
            res.status(500).send('Error');
        }
    }
}

module.exports = new VideoCallController();
