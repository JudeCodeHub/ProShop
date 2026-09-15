import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
describe('AuthController', () => {
  const authService = { register: vi.fn(), login: vi.fn() };
  let controller: AuthController;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    controller = module.get(AuthController);
  });

  it('delegates register to AuthService', async () => {
    const dto = { name: 'A', email: 'a@proshop.lk', password: 'password-1' };
    authService.register.mockResolvedValue({ id: 1 });
    await expect(controller.register(dto)).resolves.toEqual({ id: 1 });
    expect(authService.register).toHaveBeenCalledWith(dto);
  });

  it('delegates login to AuthService', async () => {
    const dto = { email: 'a@proshop.lk', password: 'password-1' };
    authService.login.mockResolvedValue({ accessToken: 't' });
    await expect(controller.login(dto)).resolves.toEqual({ accessToken: 't' });
    expect(authService.login).toHaveBeenCalledWith(dto);
  });
});
