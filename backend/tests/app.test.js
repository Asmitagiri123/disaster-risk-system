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

  test('GET /api/v1/alerts works with a token from register', async () => {
    const registerRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Demo User',
      email: 'demo-report@example.com',
      password: 'demo1234',
    });

    expect(registerRes.statusCode).toBe(201);
    expect(registerRes.body.token).toBeTruthy();

    const response = await request(app)
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${registerRes.body.token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
