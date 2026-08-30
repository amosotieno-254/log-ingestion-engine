//  metrics collection 
export class Metrics {
  totalLogs = 0;                                   
  logsByLevel: Record<string, number> = {};          
  logsByService: Record<string, number> = {};        
  errorCount = 0;                                    
  queueBacklog = 0;                                  
  private throughput = 0;                            
  private lastCount = 0;                             
  private lastTime = Date.now();                    

  // Record a processed log (after enrichment or before storage)
  record(log: { level: string; service: string }) {  
    this.totalLogs++;                                
    this.logsByLevel[log.level] = (this.logsByLevel[log.level] || 0) + 1;    
    this.logsByService[log.service] = (this.logsByService[log.service] || 0) + 1; 
    if (log.level === 'ERROR') {                    
      this.errorCount++;                             
    }
    this.updateThroughput();                         
  }

  private updateThroughput() {                       
    const now = Date.now();                          
    const elapsed = (now - this.lastTime) / 1000;    
    if (elapsed >= 1) {                              
      this.throughput = (this.totalLogs - this.lastCount) / elapsed;  
      this.lastCount = this.totalLogs;               
      this.lastTime = now;                           
    }
  }

  // Error rate as percentage
  getErrorRate(): number {                           
    return this.totalLogs ? (this.errorCount / this.totalLogs) * 100 : 0;  
  }

  snapshot() {                                      
    return {
      total_logs: this.totalLogs,                    
      logs_by_level: this.logsByLevel,               
      logs_by_service: this.logsByService,           
      error_rate: this.getErrorRate(),               
      throughput: this.throughput,                   
      queue_backlog: this.queueBacklog,              
    };
  }
}