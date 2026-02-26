export interface Alert {
  id: string;
  timestamp: number;
  type: 'TRADE' | 'RISK' | 'SYSTEM' | 'PRICE';
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
}

export class AlertManager {
  private alerts: Alert[] = [];

  public sendAlert(type: Alert['type'], message: string, severity: Alert['severity'] = 'INFO') {
    const alert: Alert = {
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      type,
      message,
      severity,
    };
    this.alerts.push(alert);
    
    // Keep last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    // Simulate sending Email/SMS
    this.dispatchNotification(alert);
  }

  private dispatchNotification(alert: Alert) {
    // In a real system, this would use Twilio, SendGrid, etc.
    if (alert.severity === 'CRITICAL') {
      console.log(`[SMS/EMAIL ALERT] CRITICAL: ${alert.message}`);
    } else if (alert.severity === 'WARNING') {
      console.log(`[EMAIL ALERT] WARNING: ${alert.message}`);
    } else {
      console.log(`[ALERT] ${alert.type}: ${alert.message}`);
    }
  }

  public getRecentAlerts() {
    return this.alerts;
  }
}
