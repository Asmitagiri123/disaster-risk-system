const request = require('supertest');
const app = require('../src/app');

describe('Disaster Prediction API', () => {
  test('GET /health returns service status', async () => {
    const response = await request(app).get('/health');
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      status: 'ok',
      service: 'Disaster Prediction API',
    });
  });
});
