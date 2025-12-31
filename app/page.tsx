"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  RefreshCw,
  Pause,
  Play,
  Download,
  PlayCircle,
  ExternalLink,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react"
import { useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { set } from "date-fns"



type TaskStatus = "completed" | "running" | "pending" | "error"

type WorkflowTask = {
  id: string
  name: string
  batchNumber: string
  settlementDate: string
  plannedStartTime: string
  actualStartTime: string | null
  plannedEndTime: string
  actualEndTime: string | null
  status: TaskStatus
  hasDownload: boolean
  filePath?: string
}

type Transaction = {
  id: string
  time: string
  orderId: string
  type: string
  amount: number
  tokenSymbol: string
  amountCNY: number
  merchantId: string
  terminalId: string
  txHash: string
}

type ApiOrderItem = {
  orderState: string
  offChain: {
    id: number
    transactionTime: string
    referenceNumber: string
    orderState: string
    transactionTypeCode: string
    transactionAmount: number
    merchantId: string
    terminalId: string
    chainTransactionHash: string
    createdAt:string
    tokenSymbol: string
  }
}

type ApiOrderResponse = {
  data: {
    list: ApiOrderItem[]
    pageNum: number
    pageSize: number
    totalNum: number
  }
  statusCode: string
  msg: string
}

export default function WorkflowPage() {
  const [workDate, setWorkDate] = useState(formatDateToYYYYMMDD(new Date()))
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date())
  const [isPaused, setIsPaused] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  // const [tasks, setTasks] = useState<WorkflowTask[]>([
  //   {
  //     id: "1",
  //     name: "稳定币交易清分",
  //     batchNumber: "99",
  //     settlementDate: "2025/12/11",
  //     plannedStartTime: "03:00:00",
  //     actualStartTime: "03:00:12",
  //     plannedEndTime: "04:00:00",
  //     actualEndTime: "03:58:45",
  //     status: "completed",
  //     hasDownload: false,
  //   },
  //   {
  //     id: "2",
  //     name: "汇总轧差",
  //     batchNumber: "99",
  //     settlementDate: "2025/12/11",
  //     plannedStartTime: "04:00:00",
  //     actualStartTime: "04:00:05",
  //     plannedEndTime: "05:00:00",
  //     actualEndTime: null,
  //     status: "error",
  //     hasDownload: false,
  //   },
  //   {
  //     id: "3",
  //     name: "清算交易流水文件生成",
  //     batchNumber: "99",
  //     settlementDate: "2025/12/11",
  //     plannedStartTime: "05:00:00",
  //     actualStartTime: null,
  //     plannedEndTime: "05:30:00",
  //     actualEndTime: null,
  //     status: "pending",
  //     hasDownload: true,
  //   },
  //   {
  //     id: "4",
  //     name: "大额划付文件生成",
  //     batchNumber: "99",
  //     settlementDate: "2025/12/11",
  //     plannedStartTime: "05:00:00",
  //     actualStartTime: null,
  //     plannedEndTime: "05:30:00",
  //     actualEndTime: null,
  //     status: "pending",
  //     hasDownload: true,
  //   },
  // ])
  const [tasks, setTasks] = useState<WorkflowTask[]>([])

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [filePath, setFilePath] = useState<string>("")
  const pageSize = 5
  const [balance, setBalance] = useState<string>("1.00") // 初始余额
  const [tokenSymbol, setTokenSymbol] = useState<string>("USDC") // 初始币种
  const [userAddress, setUserAddress] = useState<string>("0x888...C1D2") // 初始用户地址
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [balanceList, setBalanceList] = useState<{ tokenSymbol: string; balance: string }[]>([])


  const fetchBalance = async () => {
    try {
      const res = await fetch("http://172.20.10.6:8088/admin/getBalance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "*/*",
        },
        body:JSON.stringify({
          primaryAccountNumber: '625807******4153',
        }), // 和 curl -d '' 一致
      })
      const data = await res.json()

      if (data.statusCode === "00") {
        const balances = data.data.map((item: any) => ({
          tokenSymbol: item.tokenSymbol,
          balance: item.balance,
        }))

        setBalanceList(balances)
        setUserAddress(data.data[0].userAddress || "0x888...C1D2") // 获取用户地址
      } else {
        console.log("获取余额失败，请稍后重试")
      }
    } catch (error) {
      console.error("获取余额失败", error)
    }
  }

function formatDateToYYYYMMDD(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // 月份是从0开始的，所以要加1
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

const shortenHash = (hash: string, start = 6, end = 6) => {
  if (!hash) return "--"
  if (hash.length <= start + end) return hash
  return `${hash.slice(0, start)}...${hash.slice(-end)}`
}

const handleBatchExecute = async () => {
  try {
    // ① 调接口 A
    const res = await fetch(
      "http://172.20.10.6:8088/settleTask/init",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settleDt: workDate,
          jobNo: 0,
        }),
      }
    )

    const result = await res.json()
    await sleep(1000)
    if (result.statusCode !== "00") {
      setTasks([])
      return
    }

    const list: WorkflowTask[] = result.data.map((item: any) => ({
      id: String(item.id),
      name: item.jobName,
      batchNumber: String(item.jobCode),
      settlementDate: `${item.settleDt.slice(0, 4)}/${item.settleDt.slice(4, 6)}/${item.settleDt.slice(6, 8)}`,
      plannedStartTime: item.planStartTime,
      actualStartTime: item.realStartTime ?? null,
      plannedEndTime: item.planEndTime,
      actualEndTime: item.realEndTime ?? null,
      status: mapTaskStatus(item.status),
      hasDownload: Boolean(item.filePath),
      filePath: item.filePath ? item.filePath : "",
    }))

    setTasks(list)
    const jobList: { jobNo: number; state: number }[] = result.data

    // ② 按顺序串行执行
    for (let i=0; i<5; i++) {
      const success = await handleStepExecute(
        workDate,
        i+""
      )
      await sleep(1000) // 每步间隔 1 秒
      fetchWorkflowTasks(workDate)
      // ❗ 如果你希望“失败就中断”
      if (!success) {
        console.warn(`作业 ${i} 执行失败，停止后续执行`)
        break
      }
    }

    // ③ 最终刷新一次（强烈建议）
    //fetchWorkflowTasks(workDate)
  } catch (error) {
    console.error("场次执行失败", error)
  }
}
  // 页面加载时，获取余额
  useEffect(() => {
    fetchBalance()
  }, [])
  useEffect(() => {
    fetchTransactions(currentPage)
  }, [currentPage])
  const handleRefresh = () => {
    setLastRefreshTime(new Date())
  }
  useEffect(() => {
    fetchWorkflowTasks(workDate)
  }, [])

  const handleWorkDateChange = (newDate: string) => {
    setWorkDate(newDate)
    //const formattedDate = `${newDate.slice(0, 4)}/${newDate.slice(4, 6)}/${newDate.slice(6, 8)}`
    //setTasks(tasks.map((task) => ({ ...task, settlementDate: formattedDate })))
    fetchWorkflowTasks(newDate)
  }

  const handlePauseResume = () => {
    setIsPaused(!isPaused)
  }

  const handleStepExecute = async (
  settle_dt: string,
  batchNo: string
): Promise<boolean> =>  {
    const settleDt = settle_dt.replaceAll("/", "")
    // ① 先把当前任务状态改为【执行中】
    setTasks((prev) =>
      prev.map((task) =>
        task.batchNumber === batchNo
          ? { ...task, status: "running" }
          : task
      )
    )

    try {
      const res = await fetch(
        // "http://127.0.0.1:4523/m1/7468733-7203316-default/settleTask/run",
        "http://172.20.10.6:8088/settleTask/run",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            settleDt,
            jobNo: Number(batchNo),
          }),
        }
      )

      const result = await res.json()
      fetchWorkflowTasks(workDate)
      // if (result.statusCode === "00") {
      //   // ② 执行成功 → 更新为成功
      //   setTasks((prev) =>
      //     prev.map((task) =>
      //       task.batchNumber === batchNo
      //         ? { ...task, status: "completed" }
      //         : task
      //     )
      //   )
      //   return true
      // } else {
      //   // ③ 执行失败 → 更新为失败
      //   setTasks((prev) =>
      //     prev.map((task) =>
      //       task.batchNumber === batchNo
      //         ? { ...task, status: "error" }
      //         : task
      //     )
      //   )
      //   return false
      // }
    } catch (error) {
      console.error("单步执行失败", error)

      // 网络 / 异常情况 → 标记失败
      setTasks((prev) =>
        prev.map((task) =>
          task.batchNumber === batchNo
            ? { ...task, status: "error" }
            : task
        )
      )
      return false
    } finally {
      // ④ 最终以“后端为准”刷新一次任务列表（强烈建议）
      // fetchWorkflowTasks(settle_dt)
    }
  }

  const handleDownload = async (taskName: string, location: string) => {
    try {
      const res = await fetch(
        "http://172.20.10.6:8088/file/downloadMultiple",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            location,
          }),
        }
      )

      if (!res.ok) {
        throw new Error("文件下载失败")
      }

      // 1️⃣ 读取文件流
      const blob = await res.blob()

      // 2️⃣ 从 header 中解析文件名
      const disposition = res.headers.get("Content-Disposition")
      let fileName = `${taskName}`

      if (disposition) {
        const match = disposition.match(/filename\*=UTF-8''(.+)|filename="?([^"]+)"?/)
        if (match) {
          fileName = decodeURIComponent(match[1] || match[2])
        }
      }

      // 3️⃣ 创建下载链接
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()

      // 4️⃣ 清理
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("文件下载异常", error)
      alert("文件下载失败，请稍后重试")
    }
  }



  const handleCopy = async (text: string, field: string) => {

    try {

      await navigator.clipboard.writeText(text)

      setCopiedField(field)

      setTimeout(() => setCopiedField(null), 2000)

    } catch (error) {

      console.error("[v0] Failed to copy:", error)

    }

  }

  const getStatusBadge = (status: TaskStatus) => {
    const statusConfig = {
      completed: { label: "已完成", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
      running: { label: "执行中", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
      pending: { label: "待执行", className: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
      error: { label: "异常", className: "bg-red-500/10 text-red-600 border-red-500/20" },
    }
    const config = statusConfig[status]
    return (
      <Badge variant="outline" className={config.className}>
        {config.label}
      </Badge>
    )
  }
  const fetchTransactions = async (page: number) => {
    try {
      const res = await fetch(
        "http://172.20.10.6:8088/admin/queryOrderList",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pageNum: page,
            pageSize,
          }),
        }
      )

      const result: ApiOrderResponse = await res.json()

      if (result.statusCode !== "00") return

      const list: Transaction[] = result.data.list.map((item) => {
        const off = item.offChain

        return {
          id: String(off.id),
          time: off.createdAt,
          orderId: off.referenceNumber,
          type: item.orderState ,
          amount: off.transactionAmount,
          amountCNY: Number((off.transactionAmount * 7.06).toFixed(2)),
          merchantId: off.merchantId || "--",
          terminalId: off.terminalId || "--",
          txHash: off.chainTransactionHash,
          tokenSymbol:off.tokenSymbol || "USDC",
        }
      })

      setTransactions(list)
      console.log("交易列表：", list)
      setTotalPages(Math.ceil(result.data.totalNum / pageSize))
    } catch (error) {
      console.error("查询交易列表失败", error)
    }
  }
  const fetchWorkflowTasks = async (settleDt: string) => {
    const res = await fetch(
      //"http://127.0.0.1:4523/m1/7468733-7203316-default/settleTask/tasks",
      "http://172.20.10.6:8088/settleTask/tasks",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          settleDt: settleDt,
          jobNo: 0
        }),
      }
    )

    const json = await res.json()

    if (json.statusCode !== "00") {
      setTasks([])
      return
    }

    const list: WorkflowTask[] = json.data.map((item: any) => ({
      id: String(item.id),
      name: item.jobName,
      batchNumber: String(item.jobCode),
      settlementDate: `${item.settleDt.slice(0, 4)}/${item.settleDt.slice(4, 6)}/${item.settleDt.slice(6, 8)}`,
      plannedStartTime: item.planStartTime,
      actualStartTime: item.realStartTime ?? null,
      plannedEndTime: item.planEndTime,
      actualEndTime: item.realEndTime ?? null,
      status: mapTaskStatus(item.status+""),
      hasDownload: Boolean(item.filePath),
      filePath: item.filePath ? item.filePath : "",
    }))

    setTasks(list)
  }
  const mapTaskStatus = (status: string): TaskStatus => {
    switch (status) {
      case "2":
        return "completed"
      case "1":
        return "running"
      case "0":
        return "pending"
      case "3":
        return "error"
      default:
        return "pending"
    }
  }

  const formatTime = (time: string | null) => {
    return time || <span className="text-muted-foreground">--</span>
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">稳定币交易运营平台</h1>
        </div>

        <Card className="mb-8 bg-white shadow-sm border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-xl font-semibold text-slate-900">稳定币交易流水</h2>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
              <div>
                <Card className="p-4 border-2 border-blue-300 bg-blue-50">
                  <div className="text-xs text-slate-600 mb-2">资金托管账户</div>
                  <div className="text-xs text-slate-500 mb-1">余额</div>
                  {balanceList.length > 0 ? (
                    balanceList.map((balanceItem, index) => (
                      <div key={index} className="mb-3">
                        <div className="flex items-center gap-0">
                          <span className="text-2xl font-bold text-blue-600">
                            {balanceItem.balance} {balanceItem.tokenSymbol}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <span>加载余额中...</span>
                  )}
                  <div className="text-xs text-slate-500 mb-1">账户地址</div>
                  <div className="text-xs text-slate-600 font-mono  break-all">{userAddress}</div>
                </Card>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-medium text-slate-700">交易历史记录</h3>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 hover:bg-slate-50">
                        <TableHead className="font-semibold text-slate-700">时间</TableHead>
                        <TableHead className="font-semibold text-slate-700">订单号/Tx</TableHead>
                        <TableHead className="font-semibold text-slate-700">交易类型</TableHead>
                        <TableHead className="font-semibold text-slate-700">商户号</TableHead>
                        <TableHead className="font-semibold text-slate-700">终端号</TableHead>
                        <TableHead className="font-semibold text-slate-700">用户付款金额</TableHead>
                        <TableHead className="font-semibold text-slate-700">区块链交易详情</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx) => (
                        <TableRow key={tx.id} className="hover:bg-slate-50/50">
                          <TableCell className="font-mono text-sm">{tx.time}</TableCell>
                          <TableCell className="font-medium">{tx.orderId}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                tx.type === "完成"
                                  ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                                  : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              }
                            >
                              {tx.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{tx.merchantId}</TableCell>
                          <TableCell className="font-mono text-sm">{tx.terminalId}</TableCell>
                          <TableCell className="font-semibold text-blue-600">{tx.amount} {tx.tokenSymbol}</TableCell>
                          <TableCell>
                            <a
                              href={`https://sepolia.etherscan.io/tx/${tx.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                              title={tx.txHash} // hover 显示完整 hash
                            >
                              <span className="font-mono text-xs">
                                {shortenHash(tx.txHash)}
                              </span>
                              <ExternalLink className="size-3" />
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  {[...Array(totalPages)].map((_, i) => (
                    <Button
                      key={i + 1}
                      size="sm"
                      variant={currentPage === i + 1 ? "default" : "outline"}
                      onClick={() => setCurrentPage(i + 1)}
                    >
                      {i + 1}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="bg-white shadow-sm border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900">稳定币清结算工作流</h2>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>系统刷新时间：</span>
                <span className="font-mono text-slate-700">
                  {lastRefreshTime.toLocaleTimeString("zh-CN", { hour12: false })}
                </span>
              </div>

            </div>

            <div className="flex flex-wrap items-end gap-6">
              <div className="flex flex-col gap-2">
                <label htmlFor="work-date" className="text-sm font-medium text-slate-700">
                  当前工作日期
                </label>
                <Input
                  id="work-date"
                  type="text"
                  value={workDate}
                  onChange={(e) => handleWorkDateChange(e.target.value)}
                  className="w-40 font-mono"
                  placeholder="YYYYMMDD"
                />
              </div>
              
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={handleBatchExecute} // 你的场次执行函数
                >
                  场次执行
                </Button>
              </div>
              {/* <div className="flex gap-3 ml-auto">
                <Button onClick={handleRefresh} variant="outline" className="gap-2 bg-transparent">
                  <RefreshCw className="size-4" />
                  手动刷新
                </Button>
                <Button onClick={handlePauseResume} variant={isPaused ? "default" : "outline"} className="gap-2">
                  <Pause className="size-4" />
                  暂停执行
                </Button>
                <Button onClick={handlePauseResume} variant={isPaused ? "outline" : "default"} className="gap-2">
                  <Play className="size-4" />
                  继续执行
                </Button>
              </div> */}
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="font-semibold text-slate-700 w-[240px] pl-12">作业名称</TableHead>
                  <TableHead className="font-semibold text-slate-700 w-[100px]">作业号</TableHead>
                  <TableHead className="font-semibold text-slate-700 w-[120px]">请求清算日</TableHead>
                  <TableHead className="font-semibold text-slate-700 w-[120px]">计划执行时间</TableHead>
                  <TableHead className="font-semibold text-slate-700 w-[120px]">实际执行时间</TableHead>
                  <TableHead className="font-semibold text-slate-700 w-[120px]">计划结束时间</TableHead>
                  <TableHead className="font-semibold text-slate-700 w-[120px]">实际结束时间</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">操作与状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id} className="hover:bg-slate-50/50">
                    <TableCell className="font-medium text-slate-900 pl-12">{task.name}</TableCell>
                    <TableCell className="font-mono text-sm">{task.batchNumber}</TableCell>
                    <TableCell className="text-sm">{task.settlementDate}</TableCell>
                    <TableCell className="font-mono text-sm">{task.plannedStartTime}</TableCell>
                    <TableCell className="font-mono text-sm">{formatTime(task.actualStartTime)}</TableCell>
                    <TableCell className="font-mono text-sm">{task.plannedEndTime}</TableCell>
                    <TableCell className="font-mono text-sm">{formatTime(task.actualEndTime)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {getStatusBadge(task.status)}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={() => handleStepExecute(task.settlementDate, task.batchNumber)}
                        >
                          <PlayCircle className="size-3.5" />
                          单步操作
                        </Button>
                        {task.hasDownload && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            onClick={() => handleDownload(task.name, task.filePath ? task.filePath : "")}
                          >
                            <Download className="size-3.5" />
                            文件下载
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

    </div>
  )
}
