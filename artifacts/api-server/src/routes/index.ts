import { Router, type IRouter } from "express";
import healthRouter from "./health";
import appointmentsRouter from "./appointments";
import dashboardRouter from "./dashboard";
import documentsRouter from "./documents";
import profileRouter from "./profile";
import patientsRouter from "./patients";
import recordsRouter from "./records";
import reportsRouter from "./reports";
import securityRouter from "./security";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(patientsRouter);
router.use(recordsRouter);
router.use(appointmentsRouter);
router.use(reportsRouter);
router.use(documentsRouter);
router.use(profileRouter);
router.use(securityRouter);

export default router;
